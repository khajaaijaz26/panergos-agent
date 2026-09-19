import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

// Which translucency the OS can back. Asked synchronously because the renderer
// needs it before its first paint, and answered by main because deciding it
// needs `os.release()` — a sandboxed preload may only require electron, events,
// timers and url, so importing node:os here throws before contextBridge runs
// and takes the ENTIRE bridge down with it (window.panergosDesktop undefined =>
// "Desktop IPC bridge is unavailable"). No reply means no glass, which degrades
// to an ordinary opaque window rather than a page thinned over nothing.
const translucencySupport = ipcRenderer.sendSync('panergos:translucency:support')
const hudWindowing = ipcRenderer.sendSync('panergos:hud:windowing')
const hudNativeDrag = hudWindowing?.nativeDrag === true
const launchFlags = ipcRenderer.sendSync('panergos:launch-flags')

contextBridge.exposeInMainWorld('panergosDesktop', {
  glassSupported: translucencySupport?.glass === true,
  translucencySupported: translucencySupport?.translucency === true,
  // Launch-flag fact: the app was started with --local, so the renderer may
  // show the local-models surfaces. Static for the window's lifetime.
  localModelsEnabled: launchFlags?.localModels === true,
  // Optional guided first-run experience, enabled explicitly at launch.
  guidedOnboardingEnabled: launchFlags?.guidedOnboarding === true,
  // Launch-flag fact: skip the first-run film (PANERGOS_SKIP_INTRO=1 or
  // --skip-intro). Rehearsal aid for the guided chat behind it.
  skipIntro: launchFlags?.skipIntro === true,
  getConnection: (profile, opts) => ipcRenderer.invoke('panergos:connection', profile, opts),
  // Registry-scoped backend resolution: { connectionId, profile } → descriptor.
  getConnectionFor: payload => ipcRenderer.invoke('panergos:connection:for', payload),
  getProfileRoutes: profiles => ipcRenderer.invoke('panergos:plugin-profile-routes', profiles),
  revalidateConnection: () => ipcRenderer.invoke('panergos:connection:revalidate'),
  touchBackend: profile => ipcRenderer.invoke('panergos:backend:touch', profile),
  getPoolLimits: () => ipcRenderer.invoke('panergos:pool-limits:get'),
  setPoolLimits: limits => ipcRenderer.invoke('panergos:pool-limits:set', limits),
  getGatewayWsUrl: profile => ipcRenderer.invoke('panergos:gateway:ws-url', profile),
  // Registry-scoped fresh WS URL: { connectionId, profile } → result shape of
  // getGatewayWsUrl, minted against that connection's backend.
  getGatewayWsUrlFor: payload => ipcRenderer.invoke('panergos:gateway:ws-url-for', payload),
  // Union agent roster across every registered connection.
  getAgentRoster: () => ipcRenderer.invoke('panergos:agents:roster'),
  openSessionWindow: (sessionId, opts) => ipcRenderer.invoke('panergos:window:openSession', sessionId, opts),
  openSessionInTerminal: (sessionId, opts) => ipcRenderer.invoke('panergos:window:openInTerminal', sessionId, opts),
  openWindow: () => ipcRenderer.invoke('panergos:window:openInstance'),
  openBrowserWindow: tabId => ipcRenderer.invoke('panergos:window:openBrowser', tabId),
  onBrowserPopoutClosed: callback => {
    const listener = (_event, tabId) => callback(tabId)
    ipcRenderer.on('panergos:browser-popout:closed', listener)

    return () => ipcRenderer.removeListener('panergos:browser-popout:closed', listener)
  },
  claimAmbientCue: key => ipcRenderer.invoke('panergos:ambient:claim', key),
  wakeIndicator: {
    getState: () => ipcRenderer.invoke('panergos:wake-indicator:get'),
    setState: state => ipcRenderer.send('panergos:wake-indicator:set', state),
    onState: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('panergos:wake-indicator:state', listener)

      return () => ipcRenderer.removeListener('panergos:wake-indicator:state', listener)
    }
  },
  chatOnboarding: {
    grow: request => ipcRenderer.send('panergos:chat-onboarding:grow', request),
    soloBoot: () => ipcRenderer.send('panergos:chat-onboarding:solo-boot')
  },
  introReveal: {
    open: (payload?: { hideMain?: boolean }) => ipcRenderer.invoke('panergos:intro-reveal:open', payload),
    close: (payload?: { showMain?: boolean }) => ipcRenderer.invoke('panergos:intro-reveal:close', payload),
    skip: () => ipcRenderer.send('panergos:intro-reveal:skip'),
    ready: () => ipcRenderer.send('panergos:intro-reveal:ready'),
    onSkip: callback => {
      const listener = () => callback()

      ipcRenderer.on('panergos:intro-reveal:skip', listener)

      return () => ipcRenderer.removeListener('panergos:intro-reveal:skip', listener)
    },
    onClosed: callback => {
      const listener = () => callback()

      ipcRenderer.on('panergos:intro-reveal:closed', listener)

      return () => ipcRenderer.removeListener('panergos:intro-reveal:closed', listener)
    }
  },
  petOverlay: {
    // Main renderer → main process: window lifecycle + drag. `request` is
    // `{ bounds, screen }`; resolves with the screen bounds it actually used.
    open: request => ipcRenderer.invoke('panergos:pet-overlay:open', request),
    close: () => ipcRenderer.invoke('panergos:pet-overlay:close'),
    setBounds: bounds => ipcRenderer.send('panergos:pet-overlay:set-bounds', bounds),
    setIgnoreMouse: ignore => ipcRenderer.send('panergos:pet-overlay:ignore-mouse', ignore),
    // Flip the overlay focusable (and focus it) while the composer needs keys.
    setFocusable: focusable => ipcRenderer.send('panergos:pet-overlay:set-focusable', focusable),
    // Main renderer → overlay (forwarded by main): push the latest pet state.
    pushState: payload => ipcRenderer.send('panergos:pet-overlay:state', payload),
    // Overlay → main renderer (forwarded by main): pop back in / composer submit.
    control: payload => ipcRenderer.send('panergos:pet-overlay:control', payload),
    // Overlay subscribes to state pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('panergos:pet-overlay:state', listener)

      return () => ipcRenderer.removeListener('panergos:pet-overlay:state', listener)
    },
    // Main renderer subscribes to overlay control messages.
    onControl: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('panergos:pet-overlay:control', listener)

      return () => ipcRenderer.removeListener('panergos:pet-overlay:control', listener)
    }
  },
  // HUD mode: the chrome-free floating chat. A full app renderer (own gateway)
  // sized as a floating bar, so it mounts the real composer. Main owns the
  // window; `onChanged` keeps every window's toggle truthful.
  hud: {
    nativeDrag: hudNativeDrag,
    windowing: {
      clientPlacement: hudWindowing?.clientPlacement !== false,
      controlDrag: hudWindowing?.controlDrag === true,
      nativeDrag: hudNativeDrag,
      solid: hudWindowing?.solid === true,
      workspaceTransfer: hudWindowing?.workspaceTransfer === true
    },
    open: request => ipcRenderer.invoke('panergos:hud:open', request),
    close: () => ipcRenderer.invoke('panergos:hud:close'),
    setIgnoreMouse: ignore => ipcRenderer.send('panergos:hud:ignore-mouse', ignore),
    beginMove: () => ipcRenderer.send('panergos:hud:begin-move'),
    endMove: () => ipcRenderer.send('panergos:hud:end-move'),
    moveBy: delta => ipcRenderer.send('panergos:hud:move-by', delta),
    setWorkspaceTransfer: transferring => ipcRenderer.send('panergos:hud:workspace-transfer', transferring),
    setBounds: bounds => ipcRenderer.send('panergos:hud:set-bounds', bounds),
    resetLayout: () => ipcRenderer.invoke('panergos:hud:reset-layout'),
    // Whether the band covers the window below the bar. Main pairs it with the
    // user's translucency setting to decide the native frost (macOS vibrancy /
    // Windows 11 DWM backdrop) — see hudFrostFor.
    setFrost: showing => ipcRenderer.invoke('panergos:hud:frost', showing),
    // The HUD tells main which session it is on; main hands that back to the
    // app window when the HUD closes, so the app can re-home onto it.
    setSession: sessionId => ipcRenderer.send('panergos:hud:session', sessionId),
    onGoto: callback => {
      const listener = (_event, sessionId) => callback(sessionId)
      ipcRenderer.on('panergos:hud:goto', listener)

      return () => ipcRenderer.removeListener('panergos:hud:goto', listener)
    },
    onChanged: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('panergos:hud:changed', listener)

      return () => ipcRenderer.removeListener('panergos:hud:changed', listener)
    },
    // Linux only, and silent elsewhere: where the cursor is, in page
    // coordinates, or null when it has left the window. Stands in for the
    // mousemove that `setIgnoreMouseEvents(true, { forward: true })` delivers on
    // macOS and Windows but not here.
    onCursor: callback => {
      const listener = (_event, point) => callback(point)
      ipcRenderer.on('panergos:hud:cursor', listener)

      return () => ipcRenderer.removeListener('panergos:hud:cursor', listener)
    },
    // Main's game-overlay watch: whether a fullscreen app (a game) is under
    // the HUD, so the renderer can step back to the low-opacity overlay
    // treatment while one owns the screen.
    onGameOverlay: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('panergos:hud:game-overlay', listener)

      return () => ipcRenderer.removeListener('panergos:hud:game-overlay', listener)
    }
  },
  // Quick Entry: the global-hotkey mini composer window. Main owns the OS
  // shortcut + the persisted preference; the quick window only captures text
  // and hands it back, and the primary renderer submits it through the normal
  // prompt path.
  quickEntry: {
    getSettings: () => ipcRenderer.invoke('panergos:quick-entry:settings:get'),
    setSettings: patch => ipcRenderer.invoke('panergos:quick-entry:settings:set', patch),
    submit: payload => ipcRenderer.send('panergos:quick-entry:submit', payload),
    dismiss: () => ipcRenderer.send('panergos:quick-entry:dismiss'),
    // Primary renderer → main → quick window: gateway connection state + the
    // recent-session options the target picker offers. Main caches the latest
    // payload so a freshly spawned quick window starts from truth.
    pushState: payload => ipcRenderer.send('panergos:quick-entry:state', payload),
    // Quick window subscribes to those pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('panergos:quick-entry:state', listener)

      return () => ipcRenderer.removeListener('panergos:quick-entry:state', listener)
    },
    // Main → primary renderer: a submit captured by the quick window.
    onSubmit: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('panergos:quick-entry:submit', listener)

      return () => ipcRenderer.removeListener('panergos:quick-entry:submit', listener)
    },
    // Main → quick window: you were just summoned (reset draft + refocus).
    onShown: callback => {
      const listener = () => callback()
      ipcRenderer.on('panergos:quick-entry:shown', listener)

      return () => ipcRenderer.removeListener('panergos:quick-entry:shown', listener)
    }
  },
  getBootProgress: () => ipcRenderer.invoke('panergos:boot-progress:get'),
  getConnectionConfig: profile => ipcRenderer.invoke('panergos:connection-config:get', profile),
  saveConnectionConfig: payload => ipcRenderer.invoke('panergos:connection-config:save', payload),
  applyConnectionConfig: payload => ipcRenderer.invoke('panergos:connection-config:apply', payload),
  testConnectionConfig: payload => ipcRenderer.invoke('panergos:connection-config:test', payload),
  // Opt-in OS-keychain encryption for stored gateway secrets (default off —
  // see secret-storage-policy.ts). get never touches the OS keychain.
  getSecretStorageEncryption: () => ipcRenderer.invoke('panergos:secret-storage:get'),
  setSecretStorageEncryption: (on: boolean) => ipcRenderer.invoke('panergos:secret-storage:set', on),
  // v2 multi-connection registry: named agent sources (local / remote / ssh).
  connections: {
    list: () => ipcRenderer.invoke('panergos:connections:list'),
    save: payload => ipcRenderer.invoke('panergos:connections:save', payload),
    remove: id => ipcRenderer.invoke('panergos:connections:remove', id),
    setPrimary: id => ipcRenderer.invoke('panergos:connections:set-primary', id),
    setLaunchMode: mode => ipcRenderer.invoke('panergos:connections:set-launch-mode', mode),
    setLastUsed: id => ipcRenderer.invoke('panergos:connections:set-last-used', id),
    test: id => ipcRenderer.invoke('panergos:connections:test', id),
    updateManaged: id => ipcRenderer.invoke('panergos:connections:update-managed', id),
    // Fan out `panergos update` to every eligible registered connection.
    // Optional excludeIds skips rows the caller updates through another path.
    updateAll: options => ipcRenderer.invoke('panergos:connections:update-all', options),
    // Registry lifecycle push (main → renderer): a connection was removed or
    // materially edited, so secondaries scoped to it must be disposed (and,
    // for edits, re-dialed at the new target).
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('panergos:connections:changed', listener)

      return () => ipcRenderer.removeListener('panergos:connections:changed', listener)
    }
  },
  sshConfigHosts: () => ipcRenderer.invoke('panergos:ssh-config:hosts'),
  sshResolveHost: host => ipcRenderer.invoke('panergos:ssh-config:resolve', host),
  probeConnectionConfig: remoteUrl => ipcRenderer.invoke('panergos:connection-config:probe', remoteUrl),
  oauthLoginConnectionConfig: remoteUrl => ipcRenderer.invoke('panergos:connection-config:oauth-login', remoteUrl),
  oauthLogoutConnectionConfig: remoteUrl => ipcRenderer.invoke('panergos:connection-config:oauth-logout', remoteUrl),
  profile: {
    get: () => ipcRenderer.invoke('panergos:profile:get'),
    remember: name => ipcRenderer.invoke('panergos:profile:remember', name),
    set: name => ipcRenderer.invoke('panergos:profile:set', name)
  },
  api: request => ipcRenderer.invoke('panergos:api', request),
  notify: payload => ipcRenderer.invoke('panergos:notify', payload),
  requestMicrophoneAccess: () => ipcRenderer.invoke('panergos:requestMicrophoneAccess'),
  readWindowBelow: () => ipcRenderer.invoke('panergos:window:readBelow'),
  readFileDataUrl: filePath => ipcRenderer.invoke('panergos:readFileDataUrl', filePath),
  readFileDataUrlForAttach: filePath => ipcRenderer.invoke('panergos:readFileDataUrlForAttach', filePath),
  dataUrlReadMax: {
    get: () => ipcRenderer.invoke('panergos:data-url-read-max:get'),
    set: maxMb => ipcRenderer.invoke('panergos:data-url-read-max:set', maxMb)
  },
  readFileText: filePath => ipcRenderer.invoke('panergos:readFileText', filePath),
  readPluginSource: (filePath: string) => ipcRenderer.invoke('panergos:readPluginSource', filePath),
  selectPaths: options => ipcRenderer.invoke('panergos:selectPaths', options),
  selectSavePath: options => ipcRenderer.invoke('panergos:selectSavePath', options),
  writeClipboard: text => ipcRenderer.invoke('panergos:writeClipboard', text),
  readClipboard: () => ipcRenderer.invoke('panergos:readClipboard'),
  saveGatewayFile: payload => ipcRenderer.invoke('panergos:saveGatewayFile', payload),
  saveImageFromUrl: url => ipcRenderer.invoke('panergos:saveImageFromUrl', url),
  contextMenuEdit: command => ipcRenderer.invoke('panergos:context-menu:edit', command),
  contextMenuCopyImage: () => ipcRenderer.invoke('panergos:context-menu:copy-image'),
  contextMenuSpellcheck: action => ipcRenderer.invoke('panergos:context-menu:spellcheck', action),
  contextMenuGuestAddWord: payload => ipcRenderer.invoke('panergos:context-menu:guest-add-word', payload),
  onContextMenuSpellcheck: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('panergos:context-menu-spellcheck', listener)

    return () => ipcRenderer.removeListener('panergos:context-menu-spellcheck', listener)
  },
  saveImageBuffer: (data, ext, name) => ipcRenderer.invoke('panergos:saveImageBuffer', { data, ext, name }),
  capturePreview: payload => ipcRenderer.invoke('panergos:capturePreview', payload),
  savePastedText: text => ipcRenderer.invoke('panergos:savePastedText', { text }),
  saveClipboardImage: () => ipcRenderer.invoke('panergos:saveClipboardImage'),
  getPathForFile: file => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch {
      return ''
    }
  },
  normalizePreviewTarget: (target, baseDir) => ipcRenderer.invoke('panergos:normalizePreviewTarget', target, baseDir),
  watchPreviewFile: url => ipcRenderer.invoke('panergos:watchPreviewFile', url),
  watchDirectory: dir => ipcRenderer.invoke('panergos:watchDirectory', dir),
  stopPreviewFileWatch: id => ipcRenderer.invoke('panergos:stopPreviewFileWatch', id),
  setActiveWork: payload => ipcRenderer.send('panergos:active-work', payload),
  setTitleBarTheme: payload => ipcRenderer.send('panergos:titlebar-theme', payload),
  setNativeTheme: mode => ipcRenderer.send('panergos:native-theme', mode),
  setTranslucency: payload => ipcRenderer.send('panergos:translucency', payload),
  setKeepAwake: on => ipcRenderer.send('panergos:keep-awake', on),
  setDisableF12: blocked => ipcRenderer.send('panergos:devtools:disable-f12', blocked),
  setPreviewShortcutActive: active => ipcRenderer.send('panergos:previewShortcutActive', Boolean(active)),
  openExternal: url => ipcRenderer.invoke('panergos:openExternal', url),
  mcpOauth: {
    // One-shot loopback listener for MCP OAuth against remote backends: bind
    // on this machine, hand redirectUri to mcp.servers.oauth.start, then wait
    // for the provider redirect and relay code/state via oauth.callback.
    listen: () => ipcRenderer.invoke('panergos:mcp-oauth:listen'),
    wait: (id, timeoutMs) => ipcRenderer.invoke('panergos:mcp-oauth:wait', id, timeoutMs),
    cancel: id => ipcRenderer.invoke('panergos:mcp-oauth:cancel', id)
  },
  openPreviewInBrowser: url => ipcRenderer.invoke('panergos:openPreviewInBrowser', url),
  reachPreviewUrl: url => ipcRenderer.invoke('panergos:preview:reach', url),
  setActiveConnectionRoute: route => ipcRenderer.send('panergos:connection:active-route', route),
  fetchLinkTitle: url => ipcRenderer.invoke('panergos:fetchLinkTitle', url),
  resolveFavicon: url => ipcRenderer.invoke('panergos:resolveFavicon', url),
  sanitizeWorkspaceCwd: cwd => ipcRenderer.invoke('panergos:workspace:sanitize', cwd),
  settings: {
    getDefaultProjectDir: () => ipcRenderer.invoke('panergos:setting:defaultProjectDir:get'),
    setDefaultProjectDir: dir => ipcRenderer.invoke('panergos:setting:defaultProjectDir:set', dir),
    pickDefaultProjectDir: () => ipcRenderer.invoke('panergos:setting:defaultProjectDir:pick')
  },
  zoom: {
    // Current zoom of this window, as { level, percent }.
    get: () => ipcRenderer.invoke('panergos:zoom:get'),
    // Synchronous zoom factor (1 = 100%). Coordinate math needs it in the
    // same tick as the event it converts, so no IPC round-trip here.
    factor: () => webFrame.getZoomFactor(),
    setPercent: percent => ipcRenderer.send('panergos:zoom:set-percent', percent),
    // Fires on every zoom change, including the Ctrl/Cmd +/-/0 shortcuts,
    // so the settings UI can stay in sync with the keyboard.
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('panergos:zoom:changed', listener)

      return () => ipcRenderer.removeListener('panergos:zoom:changed', listener)
    }
  },
  revealLogs: () => ipcRenderer.invoke('panergos:logs:reveal'),
  getRecentLogs: () => ipcRenderer.invoke('panergos:logs:recent'),
  // Fire-and-forget: persists a renderer error-boundary catch (with component
  // stack) to desktop.log so crashes survive the window (#79428).
  reportRendererError: report => ipcRenderer.send('panergos:logs:renderer-error', report),
  readDir: dirPath => ipcRenderer.invoke('panergos:fs:readDir', dirPath),
  gitRoot: startPath => ipcRenderer.invoke('panergos:fs:gitRoot', startPath),
  revealPath: targetPath => ipcRenderer.invoke('panergos:fs:reveal', targetPath),
  openDir: dirPath => ipcRenderer.invoke('panergos:fs:openDir', dirPath),
  desktopPluginsRoot: () => ipcRenderer.invoke('panergos:fs:desktopPluginsRoot'),
  reconcileDesktopPlugins: () => ipcRenderer.invoke('panergos:fs:reconcileDesktopPlugins'),
  logsRoot: () => ipcRenderer.invoke('panergos:fs:logsRoot'),
  renamePath: (targetPath, newName) => ipcRenderer.invoke('panergos:fs:rename', targetPath, newName),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('panergos:fs:writeText', filePath, content),
  trashPath: targetPath => ipcRenderer.invoke('panergos:fs:trash', targetPath),
  git: {
    worktreeList: repoPath => ipcRenderer.invoke('panergos:git:worktreeList', repoPath),
    worktreeAdd: (repoPath, options) => ipcRenderer.invoke('panergos:git:worktreeAdd', repoPath, options),
    worktreeRemove: (repoPath, worktreePath, options) =>
      ipcRenderer.invoke('panergos:git:worktreeRemove', repoPath, worktreePath, options),
    branchSwitch: (repoPath, branch) => ipcRenderer.invoke('panergos:git:branchSwitch', repoPath, branch),
    branchList: repoPath => ipcRenderer.invoke('panergos:git:branchList', repoPath),
    baseBranchList: repoPath => ipcRenderer.invoke('panergos:git:baseBranchList', repoPath),
    repoStatus: repoPath => ipcRenderer.invoke('panergos:git:repoStatus', repoPath),
    fileDiff: (repoPath, filePath) => ipcRenderer.invoke('panergos:git:fileDiff', repoPath, filePath),
    scanRepos: (roots, options) => ipcRenderer.invoke('panergos:git:scanRepos', roots, options),
    review: {
      list: (repoPath, scope, baseRef) => ipcRenderer.invoke('panergos:git:review:list', repoPath, scope, baseRef),
      diff: (repoPath, filePath, scope, baseRef, staged) =>
        ipcRenderer.invoke('panergos:git:review:diff', repoPath, filePath, scope, baseRef, staged),
      stage: (repoPath, filePath) => ipcRenderer.invoke('panergos:git:review:stage', repoPath, filePath),
      unstage: (repoPath, filePath) => ipcRenderer.invoke('panergos:git:review:unstage', repoPath, filePath),
      revert: (repoPath, filePath) => ipcRenderer.invoke('panergos:git:review:revert', repoPath, filePath),
      revParse: (repoPath, ref) => ipcRenderer.invoke('panergos:git:review:revParse', repoPath, ref),
      commit: (repoPath, message, push) => ipcRenderer.invoke('panergos:git:review:commit', repoPath, message, push),
      commitContext: repoPath => ipcRenderer.invoke('panergos:git:review:commitContext', repoPath),
      push: repoPath => ipcRenderer.invoke('panergos:git:review:push', repoPath),
      shipInfo: repoPath => ipcRenderer.invoke('panergos:git:review:shipInfo', repoPath),
      prList: (repoPath, branches, numbers) =>
        ipcRenderer.invoke('panergos:git:review:prList', repoPath, branches, numbers),
      fetchPrComment: (repoPath, url) => ipcRenderer.invoke('panergos:git:review:fetchPrComment', repoPath, url),
      createPr: repoPath => ipcRenderer.invoke('panergos:git:review:createPr', repoPath)
    }
  },
  terminal: {
    attach: id => ipcRenderer.invoke('panergos:terminal:attach', id),
    cwd: id => ipcRenderer.invoke('panergos:terminal:cwd', id),
    dispose: id => ipcRenderer.invoke('panergos:terminal:dispose', id),
    resize: (id, size) => ipcRenderer.invoke('panergos:terminal:resize', id, size),
    start: options => ipcRenderer.invoke('panergos:terminal:start', options),
    write: (id, data) => ipcRenderer.invoke('panergos:terminal:write', id, data),
    onData: (id, callback) => {
      const channel = `panergos:terminal:${id}:data`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (id, callback) => {
      const channel = `panergos:terminal:${id}:exit`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    }
  },
  onClosePreviewRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('panergos:close-preview-requested', listener)

    return () => ipcRenderer.removeListener('panergos:close-preview-requested', listener)
  },
  onPreviewNav: callback => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('panergos:preview-nav', listener)

    return () => ipcRenderer.removeListener('panergos:preview-nav', listener)
  },
  onOpenFolderRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('panergos:open-folder-requested', listener)

    return () => ipcRenderer.removeListener('panergos:open-folder-requested', listener)
  },
  onOpenUpdatesRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('panergos:open-updates', listener)

    return () => ipcRenderer.removeListener('panergos:open-updates', listener)
  },
  onDeepLink: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('panergos:deep-link', listener)

    return () => ipcRenderer.removeListener('panergos:deep-link', listener)
  },
  signalDeepLinkReady: () => ipcRenderer.invoke('panergos:deep-link-ready'),
  probePluginRepo: payload => ipcRenderer.invoke('panergos:plugin:probe', payload),
  installDesktopPlugin: payload => ipcRenderer.invoke('panergos:plugin:installDesktop', payload),
  onWindowStateChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('panergos:window-state-changed', listener)

    return () => ipcRenderer.removeListener('panergos:window-state-changed', listener)
  },
  onFocusSession: callback => {
    const listener = (_event, sessionId) => callback(sessionId)
    ipcRenderer.on('panergos:focus-session', listener)

    return () => ipcRenderer.removeListener('panergos:focus-session', listener)
  },
  onNotificationAction: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('panergos:notification-action', listener)

    return () => ipcRenderer.removeListener('panergos:notification-action', listener)
  },
  onNotificationActivate: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('panergos:notification-activate', listener)

    return () => ipcRenderer.removeListener('panergos:notification-activate', listener)
  },
  onPreviewFileChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('panergos:preview-file-changed', listener)

    return () => ipcRenderer.removeListener('panergos:preview-file-changed', listener)
  },
  onBackendExit: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('panergos:backend-exit', listener)

    return () => ipcRenderer.removeListener('panergos:backend-exit', listener)
  },
  // Soft gateway-mode apply finished tearing down the primary backend. Renderer
  // should wipe session lists + re-dial without a window reload.
  onConnectionApplied: callback => {
    const listener = () => callback()
    ipcRenderer.on('panergos:connection:applied', listener)

    return () => ipcRenderer.removeListener('panergos:connection:applied', listener)
  },
  onPowerResume: callback => {
    const listener = () => callback()
    ipcRenderer.on('panergos:power-resume', listener)

    return () => ipcRenderer.removeListener('panergos:power-resume', listener)
  },
  // AC ↔ battery transitions; renderers slow their backstop polls on battery.
  getOnBattery: () => ipcRenderer.invoke('panergos:power-battery:get'),
  onBatteryChanged: callback => {
    const listener = (_event, onBattery) => callback(Boolean(onBattery))
    ipcRenderer.on('panergos:power-battery', listener)

    return () => ipcRenderer.removeListener('panergos:power-battery', listener)
  },
  onBootProgress: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('panergos:boot-progress', listener)

    return () => ipcRenderer.removeListener('panergos:boot-progress', listener)
  },
  // First-launch bootstrap progress -- emitted by the install.ps1 stage
  // runner in main.ts (apps/desktop/electron/bootstrap-runner.ts).
  // Renderer's install overlay subscribes to live events and queries the
  // current snapshot via getBootstrapState() to recover after a devtools
  // reload mid-bootstrap.
  getBootstrapState: () => ipcRenderer.invoke('panergos:bootstrap:get'),
  continueBootstrapLocal: () => ipcRenderer.invoke('panergos:bootstrap:continue-local'),
  recycleBackend: profile => ipcRenderer.invoke('panergos:backend:recycle', profile),
  resetBootstrap: () => ipcRenderer.invoke('panergos:bootstrap:reset'),
  repairBootstrap: () => ipcRenderer.invoke('panergos:bootstrap:repair'),
  cancelBootstrap: () => ipcRenderer.invoke('panergos:bootstrap:cancel'),
  onBootstrapEvent: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('panergos:bootstrap:event', listener)

    return () => ipcRenderer.removeListener('panergos:bootstrap:event', listener)
  },
  getVersion: () => ipcRenderer.invoke('panergos:version'),
  relaunchApp: () => ipcRenderer.invoke('panergos:app:relaunch'),
  getMachineProfile: () => ipcRenderer.invoke('panergos:machine:profile'),
  getRemoteDisplayReason: () => ipcRenderer.invoke('panergos:get-remote-display-reason'),
  uninstall: {
    summary: () => ipcRenderer.invoke('panergos:uninstall:summary'),
    run: mode => ipcRenderer.invoke('panergos:uninstall:run', { mode })
  },
  updates: {
    check: opts => ipcRenderer.invoke('panergos:updates:check', opts),
    apply: opts => ipcRenderer.invoke('panergos:updates:apply', opts),
    getBranch: () => ipcRenderer.invoke('panergos:updates:branch:get'),
    setBranch: name => ipcRenderer.invoke('panergos:updates:branch:set', name),
    onProgress: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('panergos:updates:progress', listener)

      return () => ipcRenderer.removeListener('panergos:updates:progress', listener)
    }
  },
  themes: {
    fetchMarketplace: id => ipcRenderer.invoke('panergos:vscode-theme:fetch', id),
    searchMarketplace: query => ipcRenderer.invoke('panergos:vscode-theme:search', query)
  },
  // Find-in-page (Ctrl/Cmd+F): delegates to Electron's
  // webContents.findInPage on the IPC sender's window so a Cmd+F pressed
  // in a secondary session window searches THAT window, not the primary.
  // `onFoundInPage` returns the unsubscribe fn; the renderer wires it via
  // `initFindInPageListener` in store/find-in-page.ts and tears it down
  // when the FindBar unmounts.
  findInPage: (query, options) => ipcRenderer.invoke('panergos:find-in-page', query, options),
  stopFindInPage: () => ipcRenderer.invoke('panergos:stop-find-in-page'),
  onFoundInPage: callback => {
    const listener = (_event, result) => callback(result)
    ipcRenderer.on('panergos:found-in-page', listener)

    return () => ipcRenderer.removeListener('panergos:found-in-page', listener)
  },
  // Main-process `before-input-event` forwards Ctrl/Cmd+F here so renderer
  // can open the FindBar even when the GTK compositor has already grabbed
  // the chord at the windowing layer (#81727).
  onOpenFindBarRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('panergos:open-find-bar', listener)

    return () => ipcRenderer.removeListener('panergos:open-find-bar', listener)
  }
})
