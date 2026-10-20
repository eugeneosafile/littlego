import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Button, c, Muted } from '../ui';

/** Full-screen QR scanner for children's ID cards. Calls onScan once per code, then closes. */
export default function QrScanner({ visible, onScan, onClose }: {
  visible: boolean; onScan: (data: string) => void; onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={() => { handled.current = false; }}>
      <View style={styles.wrap}>
        {!permission ? null : !permission.granted ? (
          <View style={styles.center}>
            <Text style={styles.title}>Camera needed to scan cards</Text>
            <Muted light>LittleGo uses the camera only to read children's QR cards.</Muted>
            <Button label="Allow camera" onPress={requestPermission} />
          </View>
        ) : (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (handled.current) return;
              handled.current = true;
              onScan(data.trim().toUpperCase());
            }}
          />
        )}
        <View style={styles.frame} pointerEvents="none" />
        <View style={styles.bottom}>
          <Text style={{ color: '#fff', textAlign: 'center' }}>Point at the QR code on the child's card</Text>
          <Button label="Cancel" kind="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.night },
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  frame: { position: 'absolute', top: '28%', left: '15%', width: '70%', aspectRatio: 1, borderColor: '#7FD1AE', borderWidth: 3, borderRadius: 16 },
  bottom: { position: 'absolute', bottom: 40, left: 24, right: 24, gap: 12 },
});
