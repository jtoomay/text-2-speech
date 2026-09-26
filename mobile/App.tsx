import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { ensureMirrored, type MirrorProgress } from './src/mirror'
import { startLocalServer } from './src/server'

type Status = { phase: 'mirroring'; progress?: MirrorProgress } | { phase: 'ready'; url: string } | { phase: 'error'; message: string }

export default function App() {
  const [status, setStatus] = useState<Status>({ phase: 'mirroring' })
  const [attempt, setAttempt] = useState(0)

  const start = useCallback(async () => {
    setStatus({ phase: 'mirroring' })
    try {
      const root = await ensureMirrored((progress) => setStatus({ phase: 'mirroring', progress }))
      const origin = await startLocalServer(root)
      setStatus({ phase: 'ready', url: `${origin}/index.html` })
    } catch (err) {
      setStatus({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  useEffect(() => {
    start()
  }, [start, attempt])

  return (
    <SafeAreaView style={styles.container}>
      {status.phase === 'mirroring' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.label}>Setting up Readback{'…'}</Text>
          {status.progress && (
            <Text style={styles.sublabel}>
              {status.progress.file} ({status.progress.filesDone}/{status.progress.filesTotal},{' '}
              {Math.round((status.progress.bytesDone / status.progress.bytesTotal) * 100)}%)
            </Text>
          )}
        </View>
      )}
      {status.phase === 'error' && (
        <View style={styles.center}>
          <Text style={styles.label}>Couldn't set up the app</Text>
          <Text style={styles.sublabel}>{status.message}</Text>
          <Pressable style={styles.button} onPress={() => setAttempt((n) => n + 1)}>
            <Text style={styles.buttonLabel}>Retry</Text>
          </Pressable>
        </View>
      )}
      {status.phase === 'ready' && (
        <WebView
          source={{ uri: status.url }}
          style={styles.webview}
          originWhitelist={['http://127.0.0.1:*']}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          domStorageEnabled
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  webview: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  label: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 12 },
  sublabel: { color: '#aaa', fontSize: 13, textAlign: 'center' },
  button: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#2a5', borderRadius: 8 },
  buttonLabel: { color: '#fff', fontWeight: '600' },
})
