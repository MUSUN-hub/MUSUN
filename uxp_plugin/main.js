const BASE_URL = "http://127.0.0.1:8765";

const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const connectBtn = document.getElementById("connectBtn");
const stopBtn = document.getElementById("stopBtn");
const cutBtn = document.getElementById("cutBtn");
const copyBtn = document.getElementById("copyBtn");
const clearBtn = document.getElementById("clearBtn");

let polling = false;

function log(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console.log(line);
  logEl.value = line + "\n" + logEl.value;
}

function setStatus(connected) {
  statusEl.textContent = connected ? "Connected (polling)" : "Disconnected";
  statusEl.className = connected ? "connected" : "disconnected";
}

async function pingOnce() {
  try {
    const r = await fetch(BASE_URL + "/ping");
    log("ping status: " + r.status);
    return r.ok;
  } catch (e) {
    log("ping exception: " + (e && e.message || e) + " | name=" + (e && e.name));
    return false;
  }
}

async function pollLoop() {
  if (polling) return;
  polling = true;
  setStatus(true);
  log("Polling started");

  while (polling) {
    try {
      const r = await fetch(BASE_URL + "/poll");
      if (!r.ok) {
        log("Poll HTTP " + r.status);
        await sleep(1500);
        continue;
      }
      const cmd = await r.json();
      if (!cmd || !cmd.type) continue;
      log("RX: " + cmd.type + " id=" + cmd.id);
      const result = await handleCommand(cmd);
      await fetch(BASE_URL + "/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cmd.id, result }),
      });
    } catch (e) {
      log("Poll error: " + (e && e.message || e));
      setStatus(false);
      await sleep(2000);
      if (polling) setStatus(true);
    }
  }

  setStatus(false);
  log("Polling stopped");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function handleCommand(msg) {
  try {
    switch (msg.type) {
      case "ping":              return { ok: true, pong: true };
      case "cut_at_playhead":   return await cutAtPlayhead();
      case "get_sequence_info": return await getSequenceInfo();
      case "import_media":      return await importMedia(msg);
      case "add_clip_to_sequence": return await addClipToSequence(msg);
      case "add_marker":        return await addMarker(msg);
      case "export_sequence":   return await exportSequence(msg);
      case "set_playhead":      return await setPlayhead(msg);
      case "delete_clip":       return await deleteClip(msg);
      case "move_clip":         return await moveClip(msg);
      case "list_project_items": return await listProjectItems();
      case "set_clip_disabled": return await setClipDisabled(msg);
      case "set_sequence_settings": return await setSequenceSettings(msg);
      case "mute_track":         return await muteTrack(msg);
      case "export_frame":       return await exportFrame(msg);
      case "create_bin":         return await createBin(msg);
      case "move_items_to_bin":  return await moveItemsToBin(msg);
      case "delete_bin":         return await deleteBin(msg);
      case "close_gaps":         return await closeGaps(msg);
      case "set_clip_start_end": return await setClipStartEnd(msg);
      case "insert_mogrt":       return await insertMogrt(msg);
      case "insert_srt":         return await insertSrt(msg);
      case "razor_at_seconds":   return await razorAtSeconds(msg);
      default: return { ok: false, error: "unknown command: " + msg.type };
    }
  } catch (e) {
    return { ok: false, error: String(e && e.stack || e) };
  }
}

// ---------- Helpers ----------

async function _activeProjectAndSequence() {
  const ppro = require("premierepro");
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("no active project");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("no active sequence");
  return { ppro, project, sequence };
}

async function _findProjectItem(project, name) {
  const root = await project.getRootItem();
  const walk = async (folder) => {
    const items = await folder.getItems();
    for (const it of items) {
      if (it.name === name) return it;
      // recurse into sub-bins if any
      if (it.getItems) {
        try {
          const sub = await walk(it);
          if (sub) return sub;
        } catch (_) {}
      }
    }
    return null;
  };
  return await walk(root);
}

// ---------- Handlers ----------

async function getSequenceInfo() {
  const { sequence } = await _activeProjectAndSequence();
  const vCount = await sequence.getVideoTrackCount();
  const aCount = await sequence.getAudioTrackCount();
  const playhead = await sequence.getPlayerPosition();
  const playheadSec = playhead.seconds;
  const videoTracks = [];
  for (let i = 0; i < vCount; i++) {
    const tr = await sequence.getVideoTrack(i);
    const items = await tr.getTrackItems(1, false);
    const clips = [];
    for (const it of items) {
      clips.push({
        name: await it.getName(),
        startSec: (await it.getStartTime()).seconds,
        endSec: (await it.getEndTime()).seconds,
        disabled: await it.isDisabled(),
      });
    }
    videoTracks.push({ index: i, name: await tr.name, clips });
  }
  const audioTracks = [];
  for (let i = 0; i < aCount; i++) {
    const tr = await sequence.getAudioTrack(i);
    const items = await tr.getTrackItems(1, false);
    const clips = [];
    for (const it of items) {
      clips.push({
        name: await it.getName(),
        startSec: (await it.getStartTime()).seconds,
        endSec: (await it.getEndTime()).seconds,
      });
    }
    audioTracks.push({ index: i, name: await tr.name, muted: await tr.isMuted(), clips });
  }
  return {
    ok: true,
    name: sequence.name,
    playheadSec,
    videoTracks,
    audioTracks,
  };
}

async function importMedia(msg) {
  const ppro = require("premierepro");
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("no active project");
  const paths = msg.filePaths || [];
  if (paths.length === 0) return { ok: false, error: "filePaths empty" };
  const root = await project.getRootItem();
  const before = await root.getItems();
  const beforeNames = new Set(before.map(i => i.name));
  const ok = await project.importFiles(paths, true, root);
  const after = await root.getItems();
  const added = after.filter(i => !beforeNames.has(i.name)).map(i => i.name);
  return { ok: !!ok, imported: added };
}

async function addClipToSequence(msg) {
  const { ppro, project, sequence } = await _activeProjectAndSequence();
  const item = await _findProjectItem(project, msg.itemName);
  if (!item) return { ok: false, error: "project item not found: " + msg.itemName };
  const editor = await ppro.SequenceEditor.getEditor(sequence);
  const time = await ppro.TickTime.createWithSeconds(Number(msg.timeSeconds || 0));
  const vIdx = (msg.videoTrackIndex == null) ? 0 : Number(msg.videoTrackIndex);
  const aIdx = (msg.audioTrackIndex == null) ? 0 : Number(msg.audioTrackIndex);
  const overwrite = !!msg.overwrite;
  await project.lockedAccess(() => {
    return project.executeTransaction((compound) => {
      const action = overwrite
        ? editor.createOverwriteItemAction(item, time, vIdx, aIdx)
        : editor.createInsertProjectItemAction(item, time, vIdx, aIdx, true);
      compound.addAction(action);
    });
  });
  return { ok: true };
}

async function addMarker(msg) {
  const { ppro, project, sequence } = await _activeProjectAndSequence();
  const markers = await ppro.Markers.getMarkers(sequence);
  const start = await ppro.TickTime.createWithSeconds(Number(msg.timeSeconds || 0));
  const dur = await ppro.TickTime.createWithSeconds(Number(msg.durationSeconds || 0));
  await project.lockedAccess(() => {
    return project.executeTransaction((compound) => {
      const action = markers.createAddMarkerAction(
        msg.name || "",
        "Comment",
        start,
        dur,
        msg.comment || ""
      );
      compound.addAction(action);
    });
  });
  return { ok: true };
}

async function exportSequence(msg) {
  const ppro = require("premierepro");
  const { sequence } = await _activeProjectAndSequence();
  const manager = await ppro.EncoderManager.getManager();
  if (!manager) return { ok: false, error: "EncoderManager not available" };
  const exportType = msg.useAme
    ? ppro.Constants.ExportType.QUEUE_TO_AME
    : ppro.Constants.ExportType.IMMEDIATELY;
  try {
    await manager.exportSequence(sequence, exportType, msg.outputPath, msg.presetPath);
    return { ok: true, outputPath: msg.outputPath, useAme: !!msg.useAme };
  } catch(e) {
    return { ok: false, error: String(e && e.stack || e) };
  }
}

async function _getTrackAndClip(sequence, trackKind, trackIndex, clipIndex) {
  const track = (trackKind === "V")
    ? await sequence.getVideoTrack(trackIndex)
    : await sequence.getAudioTrack(trackIndex);
  if (!track) throw new Error(`track not found: ${trackKind}${trackIndex}`);
  const items = await track.getTrackItems(1, false);
  if (clipIndex < 0 || clipIndex >= items.length) {
    throw new Error(`clip index out of range: ${clipIndex} (track has ${items.length} clips)`);
  }
  return { track, item: items[clipIndex] };
}

async function setPlayhead(msg) {
  const ppro = require("premierepro");
  const { sequence } = await _activeProjectAndSequence();
  const t = await ppro.TickTime.createWithSeconds(Number(msg.timeSeconds || 0));
  await sequence.setPlayerPosition(t);
  return { ok: true, timeSeconds: Number(msg.timeSeconds || 0) };
}

async function deleteClip(msg) {
  const ppro = require("premierepro");
  const { project, sequence } = await _activeProjectAndSequence();
  const { item } = await _getTrackAndClip(sequence, msg.trackKind, Number(msg.trackIndex), Number(msg.clipIndex));
  const editor = await ppro.SequenceEditor.getEditor(sequence);
  // TrackItemSelection 패턴: sequence.getSelection() → 기존 선택 비우고 → addItem
  const sel = await sequence.getSelection();
  try {
    const existing = await sel.getTrackItems(1, false);
    for (const t of existing) await sel.removeItem(t);
  } catch (_) {}
  sel.addItem(item, true);
  await project.lockedAccess(() => {
    return project.executeTransaction((compound) => {
      compound.addAction(
        editor.createRemoveItemsAction(sel, !!msg.ripple, ppro.Constants.MediaType.ANY, false)
      );
    });
  });
  return { ok: true };
}

async function moveClip(msg) {
  const ppro = require("premierepro");
  const { project, sequence } = await _activeProjectAndSequence();
  const { item } = await _getTrackAndClip(sequence, msg.trackKind, Number(msg.trackIndex), Number(msg.clipIndex));
  const currentStart = await item.getStartTime();
  const currentStartSec = currentStart.seconds;
  const deltaSec = Number(msg.newStartSeconds) - currentStartSec;
  const deltaTick = await ppro.TickTime.createWithSeconds(deltaSec);
  await project.lockedAccess(() => {
    return project.executeTransaction((compound) => {
      compound.addAction(item.createMoveAction(deltaTick));
    });
  });
  return { ok: true, movedBySeconds: deltaSec };
}

async function listProjectItems() {
  const ppro = require("premierepro");
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("no active project");
  const root = await project.getRootItem();
  const walk = async (folder, depth) => {
    const items = await folder.getItems();
    const result = [];
    for (const it of items) {
      const entry = { name: it.name, depth };
      try { entry.type = await it.getType?.(); } catch (_) {}
      if (it.getItems) {
        try {
          entry.children = await walk(it, depth + 1);
        } catch (_) {}
      }
      result.push(entry);
    }
    return result;
  };
  const tree = await walk(root, 0);
  return { ok: true, items: tree };
}

async function setClipDisabled(msg) {
  const { project, sequence } = await _activeProjectAndSequence();
  const { item } = await _getTrackAndClip(sequence, msg.trackKind, Number(msg.trackIndex), Number(msg.clipIndex));
  await project.lockedAccess(() => {
    return project.executeTransaction((compound) => {
      compound.addAction(item.createSetDisabledAction(!!msg.disabled));
    });
  });
  return { ok: true, disabled: !!msg.disabled };
}

async function exportFrame(msg) {
  const ppro = require("premierepro");
  const { sequence } = await _activeProjectAndSequence();
  const filePath = msg.filePath;
  const seconds = Number(msg.timeSeconds || 0);
  const size = await sequence.getFrameSize();
  const t = await ppro.TickTime.createWithSeconds(seconds);
  // 경로 파싱 (window.path 없으므로 직접)
  const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const dir = filePath.substring(0, lastSlash);
  const base = filePath.substring(lastSlash + 1); // 확장자 포함 (path.parse().base 와 동일)
  const out = await ppro.Exporter.exportSequenceFrame(sequence, t, base, dir, size.width, size.height);
  if (!out) return { ok: false, error: "exportSequenceFrame returned falsy" };
  return { ok: true, filePath };
}

async function createBin(msg) {
  const ppro = require("premierepro");
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("no active project");
  const root = await project.getRootItem();
  await project.lockedAccess(() => {
    return project.executeTransaction((compound) => {
      compound.addAction(root.createBinAction(msg.binName, true));
    });
  });
  return { ok: true, binName: msg.binName };
}

async function moveItemsToBin(msg) {
  const ppro = require("premierepro");
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("no active project");
  const root = await project.getRootItem();
  const bin = await _findProjectItem(project, msg.binName);
  if (!bin) return { ok: false, error: "bin not found: " + msg.binName };
  const castedBin = await ppro.FolderItem.cast(bin);
  const itemNames = msg.itemNames || [];
  const items = [];
  for (const name of itemNames) {
    const item = await _findProjectItem(project, name);
    if (!item) return { ok: false, error: "item not found: " + name };
    items.push(item);
  }
  await project.lockedAccess(() => {
    return project.executeTransaction((compound) => {
      for (const item of items) {
        compound.addAction(root.createMoveItemAction(item, castedBin));
      }
    });
  });
  return { ok: true, moved: itemNames, toBin: msg.binName };
}

async function closeGaps(msg) {
  const ppro = require("premierepro");
  const { project, sequence } = await _activeProjectAndSequence();
  const trackKind = msg.trackKind || "video";
  const trackIndex = Number(msg.trackIndex ?? 0);
  const trackType = trackKind === "audio" ? 1 : 0;
  const track = trackType === 0
    ? await sequence.getVideoTrack(trackIndex)
    : await sequence.getAudioTrack(trackIndex);
  if (!track) throw new Error("track not found: " + trackKind + " " + trackIndex);
  const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
  if (!items || items.length === 0) return { ok: true, moved: 0 };
  items.sort(async (a, b) => {
    const as = (await a.getStartTime()).seconds;
    const bs = (await b.getStartTime()).seconds;
    return as - bs;
  });
  // 정렬 후 순서대로 targetPosition을 0부터 이동
  let targetTicks = BigInt(0);
  let moved = 0;
  for (const item of items) {
    const startTime = await item.getStartTime();
    const endTime = await item.getEndTime();
    const durationTicks = BigInt(endTime.ticks) - BigInt(startTime.ticks);
    const currentTicks = BigInt(startTime.ticks);
    if (currentTicks !== targetTicks) {
      const shiftTicks = targetTicks - currentTicks;
      const shiftTime = ppro.TickTime.createWithTicks(shiftTicks.toString());
      await project.lockedAccess(() => {
        return project.executeTransaction((compound) => {
          compound.addAction(item.createMoveAction(shiftTime));
        });
      });
      moved++;
    }
    targetTicks += durationTicks;
  }
  return { ok: true, moved };
}

async function setClipStartEnd(msg) {
  try {
    const ppro = require("premierepro");
    const { project, sequence } = await _activeProjectAndSequence();
    const { item } = await _getTrackAndClip(sequence, msg.trackKind, Number(msg.trackIndex), Number(msg.clipIndex));
    const startTick = ppro.TickTime.createWithTicks(msg.startTimeTicks.toString());
    const endTick = ppro.TickTime.createWithTicks(msg.endTimeTicks.toString());
    await project.lockedAccess(() => {
      return project.executeTransaction((compound) => {
        compound.addAction(item.createSetStartAction(startTick));
        compound.addAction(item.createSetEndAction(endTick));
      });
    });
    return { ok: true };
  } catch(e) {
    return { ok: false, error: "setClipStartEnd failed: " + String(e) };
  }
}

async function insertSrt(msg) {
  try {
    const ppro = require("premierepro");
    const { project, sequence } = await _activeProjectAndSequence();
    const srtItem = await _findProjectItem(project, msg.itemName);
    if (!srtItem) return { ok: false, error: "SRT item not found: " + msg.itemName };
    const editor = await ppro.SequenceEditor.getEditor(sequence);
    const insertionTime = ppro.TickTime.createWithTicks("0");
    await project.lockedAccess(() => {
      return project.executeTransaction((compound) => {
        compound.addAction(editor.createOverwriteItemAction(srtItem, insertionTime, -1, -1));
      });
    });
    return { ok: true };
  } catch(e) {
    return { ok: false, error: "insertSrt failed: " + String(e) };
  }
}

async function insertMogrt(msg) {
  try {
    const ppro = require("premierepro");
    const { project, sequence } = await _activeProjectAndSequence();
    const editor = await ppro.SequenceEditor.getEditor(sequence);
    const mogrtPath = msg.mogrtPath;
    const timeSeconds = Number(msg.timeSeconds || 0);
    const videoTrackIndex = Number(msg.videoTrackIndex ?? 0);
    const insertionTime = ppro.TickTime.createWithSeconds(timeSeconds);
    await project.lockedAccess(() => {
      return project.executeTransaction((compound) => {
        compound.addAction(editor.insertMogrtFromPath(mogrtPath, insertionTime, videoTrackIndex));
      });
    });
    return { ok: true };
  } catch(e) {
    return { ok: false, error: "insertMogrt failed: " + String(e) };
  }
}

async function deleteBin(msg) {
  const ppro = require("premierepro");
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("no active project");
  const bin = await _findProjectItem(project, msg.binName);
  if (!bin) return { ok: false, error: "bin not found: " + msg.binName };
  const root = await project.getRootItem();
  const castedRoot = await ppro.FolderItem.cast(root);
  await project.lockedAccess(() => {
    return project.executeTransaction((compound) => {
      compound.addAction(castedRoot.createRemoveItemAction(bin));
    });
  });
  return { ok: true, binName: msg.binName };
}

async function muteTrack(msg) {
  const { sequence } = await _activeProjectAndSequence();
  const track = (msg.trackKind === "V")
    ? await sequence.getVideoTrack(Number(msg.trackIndex))
    : await sequence.getAudioTrack(Number(msg.trackIndex));
  if (!track) return { ok: false, error: "track not found" };
  await track.setMute(!!msg.mute);
  return { ok: true, trackKind: msg.trackKind, trackIndex: msg.trackIndex, mute: !!msg.mute };
}

async function setSequenceSettings(msg) {
  const { project, sequence } = await _activeProjectAndSequence();
  const settings = await sequence.getSettings();


  if (msg.frameRate != null) {
    try {
      const fr = await settings.getVideoFrameRate();
      const TICKS_PER_SECOND = 254016000000;
      fr.ticksPerFrame = Math.round(TICKS_PER_SECOND / Number(msg.frameRate));
      settings.setVideoFrameRate(fr);
    } catch(e) { return { ok: false, error: "setVideoFrameRate failed: " + e }; }
  }

  if (msg.width != null || msg.height != null) {
    try {
      const rect = await settings.getVideoFrameRect();
      if (msg.width != null) rect.width = Number(msg.width);
      if (msg.height != null) rect.height = Number(msg.height);
      settings.setVideoFrameRect(rect);
    } catch(e) { return { ok: false, error: "setVideoFrameRect failed: " + e }; }
  }

  try {
    await project.lockedAccess(() => {
      return project.executeTransaction((compound) => {
        compound.addAction(sequence.createSetSettingsAction(settings));
      });
    });
  } catch(e) { return { ok: false, error: "createSetSettingsAction failed: " + e }; }

  return { ok: true, frameRate: msg.frameRate };
}

// BigInt-safe tick arithmetic via string representation
function ticksOf(tickTime) {
  // TickTime exposes ticks as a string-like; coerce to BigInt
  const s = (tickTime && (tickTime.ticks || tickTime.ticksNumber)) ?? tickTime;
  return BigInt(String(s));
}

async function cutAtPlayhead() {
  const ppro = require("premierepro");
  try {
    const project = await ppro.Project.getActiveProject();
    if (!project) return { ok: false, error: "no active project" };
    const sequence = await project.getActiveSequence();
    if (!sequence) return { ok: false, error: "no active sequence" };

    const cti = await sequence.getPlayerPosition();
    const ctiTicks = ticksOf(cti);
    log("CTI ticks: " + ctiTicks.toString());

    // Collect all tracks (video + audio)
    const vCount = await sequence.getVideoTrackCount();
    const aCount = await sequence.getAudioTrackCount();
    const tracks = [];
    for (let i = 0; i < vCount; i++) tracks.push(await sequence.getVideoTrack(i));
    for (let i = 0; i < aCount; i++) tracks.push(await sequence.getAudioTrack(i));

    // Find clips spanning the CTI
    const targets = [];
    for (let vi = 0; vi < vCount; vi++) {
      const track = await sequence.getVideoTrack(vi);
      const items = await track.getTrackItems(1, false);
      for (const item of items) {
        const sT = ticksOf(await item.getStartTime());
        const eT = ticksOf(await item.getEndTime());
        if (sT < ctiTicks && ctiTicks < eT) {
          targets.push({
            item, track, kind: "V", trackIndex: vi,
            projectItem: await item.getProjectItem(),
            origInTicks: ticksOf(await item.getInPoint()),
            origStartTicks: sT,
          });
        }
      }
    }
    for (let ai = 0; ai < aCount; ai++) {
      const track = await sequence.getAudioTrack(ai);
      const items = await track.getTrackItems(1, false);
      for (const item of items) {
        const sT = ticksOf(await item.getStartTime());
        const eT = ticksOf(await item.getEndTime());
        if (sT < ctiTicks && ctiTicks < eT) {
          targets.push({
            item, track, kind: "A", trackIndex: ai,
            projectItem: await item.getProjectItem(),
            origInTicks: ticksOf(await item.getInPoint()),
            origStartTicks: sT,
          });
        }
      }
    }

    if (targets.length === 0) {
      return { ok: false, error: "no clip under playhead" };
    }
    log("targets: " + targets.length);

    const editor = await ppro.SequenceEditor.getEditor(sequence);
    const ctiTick = await ppro.TickTime.createWithTicks(ctiTicks.toString());

    // Pre-compute new-outPoint TickTime objects (async; can be done before transaction)
    const newOutTicksPerTarget = [];
    for (const t of targets) {
      const newOutTicks = t.origInTicks + (ctiTicks - t.origStartTicks);
      newOutTicksPerTarget.push(await ppro.TickTime.createWithTicks(newOutTicks.toString()));
      log(`target ${t.kind}${t.trackIndex} origStart=${t.origStartTicks} origIn=${t.origInTicks} newOut=${newOutTicks}`);
    }

    // Phase 1: 각 타겟을 독립 트랜잭션으로 처리 (트랙 혼입 방지)
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const vIdx = (t.kind === "V") ? t.trackIndex : -1;
      const aIdx = (t.kind === "A") ? t.trackIndex : -1;
      await project.lockedAccess(() => {
        return project.executeTransaction((compound) => {
          compound.addAction(t.item.createSetOutPointAction(newOutTicksPerTarget[i]));
          compound.addAction(editor.createOverwriteItemAction(t.projectItem, ctiTick, vIdx, aIdx));
        });
      });
    }

    // DEBUG: dump all clips on each affected track after Phase 1
    for (const t of targets) {
      const track = (t.kind === "V")
        ? await sequence.getVideoTrack(t.trackIndex)
        : await sequence.getAudioTrack(t.trackIndex);
      const items = await track.getTrackItems(1, false);
      const desc = [];
      for (const it of items) {
        const s = ticksOf(await it.getStartTime());
        const e = ticksOf(await it.getEndTime());
        const ip = ticksOf(await it.getInPoint());
        const op = ticksOf(await it.getOutPoint());
        desc.push(`[start=${s} end=${e} in=${ip} out=${op}]`);
      }
      log(`after-phase1 ${t.kind}${t.trackIndex}: ${desc.join(" ")}`);
    }

    // Phase 2: find newly inserted right clips; collect them + precomputed inPoints
    const phase2Plan = [];
    for (const t of targets) {
      const track = (t.kind === "V")
        ? await sequence.getVideoTrack(t.trackIndex)
        : await sequence.getAudioTrack(t.trackIndex);
      const items = await track.getTrackItems(1, false);
      let newItem = null;
      for (const it of items) {
        const s = ticksOf(await it.getStartTime());
        if (s === ctiTicks) { newItem = it; break; }
      }
      if (!newItem) { log("phase2 miss: " + t.kind + t.trackIndex); continue; }
      const newInTicks = t.origInTicks + (ctiTicks - t.origStartTicks);
      const newInTick = await ppro.TickTime.createWithTicks(newInTicks.toString());
      phase2Plan.push({ newItem, newInTick });
    }
    log("phase2 plan: " + phase2Plan.length);
    if (phase2Plan.length > 0) {
      await project.lockedAccess(() => {
        return project.executeTransaction((compound) => {
          for (const p of phase2Plan) {
            compound.addAction(p.newItem.createSetInPointAction(p.newInTick));
          }
        });
      });
    }

    return { ok: true, cti: ctiTicks.toString(), split: targets.length };
  } catch (e) {
    return { ok: false, error: String(e && e.stack || e) };
  }
}

async function inspectApis() {
  try {
    const ppro = require("premierepro");
    const uxp = require("uxp");
    log("--- premierepro keys ---");
    log(Object.keys(ppro).sort().join(", "));
    if (ppro.SequenceEditor) {
      log("SequenceEditor static: " + Object.getOwnPropertyNames(ppro.SequenceEditor).join(", "));
      log("SequenceEditor proto: " + Object.getOwnPropertyNames(ppro.SequenceEditor.prototype || {}).join(", "));
    }
    if (ppro.Project) {
      log("Project static: " + Object.getOwnPropertyNames(ppro.Project).join(", "));
      log("Project proto: " + Object.getOwnPropertyNames(ppro.Project.prototype || {}).join(", "));
    }
    if (ppro.Sequence) {
      log("Sequence static: " + Object.getOwnPropertyNames(ppro.Sequence).join(", "));
      log("Sequence proto: " + Object.getOwnPropertyNames(ppro.Sequence.prototype || {}).join(", "));
    }
    if (ppro.VideoTrack) {
      log("VideoTrack proto: " + Object.getOwnPropertyNames(ppro.VideoTrack.prototype || {}).join(", "));
    }
    if (ppro.AudioTrack) {
      log("AudioTrack proto: " + Object.getOwnPropertyNames(ppro.AudioTrack.prototype || {}).join(", "));
    }
    if (ppro.VideoClipTrackItem) {
      log("VideoClipTrackItem proto: " + Object.getOwnPropertyNames(ppro.VideoClipTrackItem.prototype || {}).join(", "));
    }
    if (ppro.AudioClipTrackItem) {
      log("AudioClipTrackItem proto: " + Object.getOwnPropertyNames(ppro.AudioClipTrackItem.prototype || {}).join(", "));
    }
    if (ppro.TickTime) {
      log("TickTime static: " + Object.getOwnPropertyNames(ppro.TickTime).join(", "));
    }
    if (ppro.TrackItemSelection) {
      log("TrackItemSelection static: " + Object.getOwnPropertyNames(ppro.TrackItemSelection).join(", "));
      log("TrackItemSelection proto: " + Object.getOwnPropertyNames(ppro.TrackItemSelection.prototype || {}).join(", "));
    }
    if (ppro.SequenceSettings) {
      log("SequenceSettings static: " + Object.getOwnPropertyNames(ppro.SequenceSettings).join(", "));
      log("SequenceSettings proto: " + Object.getOwnPropertyNames(ppro.SequenceSettings.prototype || {}).join(", "));
    }
    if (ppro.SequenceUtils) {
      log("SequenceUtils static: " + Object.getOwnPropertyNames(ppro.SequenceUtils).join(", "));
      log("SequenceUtils proto: " + Object.getOwnPropertyNames(ppro.SequenceUtils.prototype || {}).join(", "));
    }
    log("--- uxp keys ---");
    log(Object.keys(uxp).join(", "));
    log("uxp.host: " + (uxp.host ? Object.keys(uxp.host).join(", ") : "none"));
  } catch (e) {
    log("inspect err: " + e);
  }
}

const inspectBtn = document.createElement("button");
inspectBtn.textContent = "Inspect APIs";
inspectBtn.addEventListener("click", inspectApis);
// 버튼이 들어있는 컨테이너(두 번째 div)에 추가. body > div는 status를 가리켜서 textContent 교체 시 사라진다.
document.querySelectorAll("body > div")[1].appendChild(inspectBtn);

connectBtn.addEventListener("click", async () => {
  if (await pingOnce()) {
    pollLoop();
  } else {
    log("Server ping failed at " + BASE_URL);
  }
});
stopBtn.addEventListener("click", () => {
  polling = false;
  setStatus(false);
  log("Stop requested");
});
cutBtn.addEventListener("click", async () => {
  try {
    const r = await cutAtPlayhead();
    log("Local cut: " + JSON.stringify(r));
  } catch (e) {
    log("Local cut error: " + (e && e.stack || e));
  }
});
copyBtn.addEventListener("click", () => {
  logEl.select();
  try {
    document.execCommand("copy");
    log("(log copied)");
  } catch (e) {
    log("copy failed: " + e);
  }
});
clearBtn.addEventListener("click", () => {
  logEl.value = "";
});

// 자동 시작 — 브리지가 뜰 때까지 무한 재시도, 연결되면 루프 종료
async function razorAtSeconds(msg) {
  const seconds = Number(msg.seconds);
  if (isNaN(seconds)) return { ok: false, error: "seconds 파라미터 필요" };

  // uxp.host.evalScript로 QE DOM razor 호출 시도
  try {
    const uxp = require("uxp");
    if (!uxp.host || typeof uxp.host.evalScript !== "function") {
      return { ok: false, error: "uxp.host.evalScript 없음 — UXP에서 ExtendScript 호출 불가" };
    }

    // 초 → HH:MM:SS:FF 변환 (30fps 기준)
    const fps = 30;
    const h  = Math.floor(seconds / 3600);
    const m  = Math.floor((seconds % 3600) / 60);
    const s  = Math.floor(seconds % 60);
    const f  = Math.round((seconds % 1) * fps);
    const pad = n => (n < 10 ? "0" : "") + n;
    const tc = pad(h) + ":" + pad(m) + ":" + pad(s) + ":" + pad(f);

    const script = `
      var result = "fail";
      try {
        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        if (qeSeq) {
          for (var v = 0; v < qeSeq.numVideoTracks; v++) {
            var vt = qeSeq.getVideoTrackAt(v);
            if (vt && typeof vt.razor === "function") vt.razor("${tc}");
          }
          for (var a = 0; a < qeSeq.numAudioTracks; a++) {
            var at = qeSeq.getAudioTrackAt(a);
            if (at && typeof at.razor === "function") at.razor("${tc}");
          }
          result = "ok";
        }
      } catch(e) { result = "error: " + e.message; }
      result;
    `;

    const res = await uxp.host.evalScript(script);
    return { ok: res === "ok", result: res, tc: tc };

  } catch(e) {
    return { ok: false, error: "razorAtSeconds failed: " + String(e) };
  }
}

(async () => {
  while (true) {
    if (await pingOnce()) {
      pollLoop();
      return;
    }
    await sleep(1500);
  }
})();
