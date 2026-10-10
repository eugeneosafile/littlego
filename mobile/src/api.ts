import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Point this at your API. On a phone, "localhost" is the phone itself, so use your computer's
// LAN address (e.g. http://192.168.1.20:8000) or a deployed URL.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export type Role = 'parent' | 'crew' | 'school_admin' | 'ops';
export type ChildStatus = 'scheduled' | 'released' | 'on_board' | 'handed_over' | 'at_safe_hub' | 'absent';

export interface User { id: number; name: string; phone: string; role: Role; crew_role: string | null }
export interface Child { id: number; name: string; class_name: string; home_address: string; home_lat?: number | null; home_lon?: number | null }
export interface TripChild {
  id: number; child: Child; stop_order: number; status: ChildStatus;
  released_at: string | null; boarded_at: string | null; handed_over_at: string | null; pin_locked: boolean;
}
export interface Vehicle { id: number; code: string; kind: string; camera_count: number; cameras_online: number }
export interface Crew { id: number; name: string; crew_role: string | null; vetted_at: string | null }
export interface TripEvent { id: number; kind: string; severity: string; message: string; created_at: string }
export interface ParentTrip {
  trip_id: number; vehicle: Vehicle; status: string; driver: Crew; escort: Crew;
  last_lat: number | null; last_lon: number | null; last_ping_at: string | null;
  school_lat: number; school_lon: number;
  my_children: TripChild[]; handover_pins: Record<string, string>; timeline: TripEvent[];
}
export interface CrewTrip {
  id: number; status: string; vehicle: Vehicle; driver: Crew; escort: Crew; children: TripChild[];
  school: { name: string; safe_hub_name: string };
}
export interface Receiver { id: number; name: string; relationship_to_child: string; phone?: string }
export interface Price { tier: 'shared' | 'group' | 'exclusive'; monthly_price: number }
export interface Stream { url: string; cameras: string[]; bitrate_kbps: number; expires_in_s: number; low_data: boolean }

const TOKEN_KEY = 'wardride_token';
let token: string | null = null;

// SecureStore keeps the token in the phone's keychain. On web we keep it in memory only.
export async function loadToken() {
  if (Platform.OS !== 'web') token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}

export async function saveToken(t: string | null) {
  token = t;
  if (Platform.OS === 'web') return;
  if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, 'No connection. Check your data or Wi-Fi and try again.');
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, typeof body.detail === 'string' ? body.detail : 'Something went wrong');
  return body as T;
}

export const post = <T,>(path: string, data?: unknown) =>
  api<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) });

export const del = (path: string) => api<void>(path, { method: 'DELETE' });

export const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

export const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;
