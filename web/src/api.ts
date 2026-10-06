// Thin client for the WardRide API.
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type Role = 'parent' | 'crew' | 'school_admin' | 'ops'
export type ChildStatus = 'scheduled' | 'released' | 'on_board' | 'handed_over' | 'at_safe_hub' | 'absent'

export interface User { id: number; name: string; phone: string; role: Role; school_id: number | null }
export interface Child { id: number; name: string; class_name: string; home_address: string }
export interface TripChild {
  id: number; child: Child; stop_order: number; status: ChildStatus
  released_at: string | null; boarded_at: string | null; handed_over_at: string | null; pin_locked: boolean
}
export interface Vehicle { id: number; code: string; plate: string; kind: string; seats: number; camera_count: number; cameras_online: number }
export interface Crew { id: number; name: string; crew_role: string | null }
export interface Trip {
  id: number; run: string; status: string; started_at: string | null; last_ping_at: string | null
  vehicle: Vehicle; driver: Crew; escort: Crew; children: TripChild[]; school: { id: number; name: string }
}
export interface QueueItem { trip_child: TripChild; trip_id: number; vehicle_code: string; card_uid: string }
export interface AlertEvent {
  id: number; kind: string; severity: 'info' | 'warning' | 'critical'; message: string
  trip_id: number | null; resolved: boolean; created_at: string
}
export interface Summary { booked_today: number; released: number; waiting: number; on_board: number; handed_over: number; open_alerts: number }

let token: string | null = sessionStorage.getItem('wr_token')

export function setToken(t: string | null) {
  token = t
  if (t) sessionStorage.setItem('wr_token', t)
  else sessionStorage.removeItem('wr_token')
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, typeof body.detail === 'string' ? body.detail : 'Request failed')
  return body as T
}

export const post = <T,>(path: string, data?: unknown) =>
  api<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) })
