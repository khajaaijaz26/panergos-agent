import { useStore } from '@nanostores/react'
import { useCallback, useState } from 'react'

import { GatewayProvider } from './app/gatewayContext.js'
import { $uiState } from './app/uiStore.js'
import { useMainApp } from './app/useMainApp.js'
import { AppLayout } from './components/appLayout.js'
import { RelayIntro, shouldPlayRelayIntro } from './components/relayIntro.js'
import type { GatewayClient } from './gatewayClient.js'

export function App({ gw }: { gw: GatewayClient }) {
  const { appActions, appComposer, appProgress, appStatus, appTranscript, gateway } = useMainApp(gw)
  const { mouseTracking, theme } = useStore($uiState)
  const [introDone, setIntroDone] = useState(() => !shouldPlayRelayIntro())
  const finishIntro = useCallback(() => setIntroDone(true), [])

  return (
    <GatewayProvider value={gateway}>
      {introDone ? (
        <AppLayout
          actions={appActions}
          composer={appComposer}
          mouseTracking={mouseTracking}
          progress={appProgress}
          status={appStatus}
          transcript={appTranscript}
        />
      ) : (
        <RelayIntro onDone={finishIntro} t={theme} />
      )}
    </GatewayProvider>
  )
}
