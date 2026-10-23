import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, c, f, Icon, Muted, QrFrame } from '../ui';

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
          <SafeAreaView style={styles.center}>
            <View style={styles.badge}><Icon name="camera" size={28} color={c.gold} /></View>
            <Text style={styles.title}>Allow the camera to scan cards</Text>
            <Muted light style={{ textAlign: 'center' }}>LittleGo uses the camera only to read children’s QR cards.</Muted>
            <Button label="Allow camera" kind="gold" onPress={requestPermission} style={{ alignSelf: 'stretch' }} />
          </SafeAreaView>
        ) : (
          <>
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
            <View style={styles.frame} pointerEvents="none"><QrFrame size={250} /></View>
          </>
        )}
        <SafeAreaView edges={['bottom']} style={styles.bottom}>
          {permission?.granted && (
            <View style={styles.hint}>
              <Icon name="qr" size={18} color={c.gold} />
              <Text style={styles.hintText}>Point at the QR code on the child’s card</Text>
            </View>
          )}
          <Button label="Cancel" kind="ghost" onPress={onClose} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.night },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 14 },
  badge: { width: 64, height: 64, borderRadius: 22, backgroundColor: c.nightCard, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 24, fontFamily: f.display, textAlign: 'center', letterSpacing: -0.5 },
  frame: { position: 'absolute', top: '24%', alignSelf: 'center' },
  bottom: { position: 'absolute', bottom: 24, left: 24, right: 24, gap: 14 },
  hint: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(6,21,44,0.78)', borderRadius: 999, paddingVertical: 12, paddingHorizontal: 18, alignSelf: 'center' },
  hintText: { color: '#fff', fontFamily: f.medium, fontSize: 15 },
});
