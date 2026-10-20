// Thin client for the LittleGo API.
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type Role = 'parent' | 'crew' | 'school_admin' | 'ops'
export type ChildStatus = 'scheduled' | 'released' | 'on_board' | 'handed_over' | 'at_safe_hub' | 'absent'

export interface User { id: number; name: string; phone: string; role: Role; school_id: number | null }
export interface Child { id: number; name: string; class_name: string; home_address: string; home_lat: number | null; home_lon: number | null }
export interface TripChild {
  id: number; child: Child; stop_order: number; status: ChildStatus
  released_at: string | null; boarded_at: string | null; handed_over_at: string | null; pin_locked: boolean
}
export interface Vehicle { id: number; code: string; plate: string; kind: string; seats: number; camera_count: number; cameras_online: number }
export interface Crew { id: number; name: string; crew_role: string | null }
export interface School { id: number; name: string; address: string; lat: number; lon: number; safe_hub_name: string }
export interface Trip {
  id: number; run: string; status: string; started_at: string | null
  last_lat: number | null; last_lon: number | null; last_ping_at: string | null
  vehicle: Vehicle; driver: Crew; escort: Crew; children: TripChild[]; school: School
}
export interface QueueItem { trip_child: TripChild; trip_id: number; vehicle_code: string; card_uid: string }
export interface AlertEvent {
  id: number; kind: string; severity: 'info' | 'warning' | 'critical'; message: string
  trip_id: number | null; resolved: boolean; created_at: string
}
export interface Summary { booked_today: number; released: number; waiting: number; on_board: number; handed_over: number; open_alerts: number }

// Admin
export interface Person {
  id: number; name: string; phone: string; role: Role; school_id: number | null; active: boolean
  crew_role: string | null; vetted_at: string | null; vetting_expires_at: string | null; vetting_notes: string
}
export interface AdminChild {
  id: number; name: string; class_name: string; school_id: number; card_uid: string; home_address: string
  home_lat: number | null; home_lon: number | null; active: boolean; parent_name: string; parent_phone: string; plan: string | null
}
export interface RouteRow {
  id: number; name: string; school_id: number; vehicle_code: string; driver_name: string; escort_name: string
  run: string; active: boolean; stops: { order: number; child_id: number; child_name: string; address: string }[]
}
export interface ImportReport { parents_created: number; children_created: number; receivers_added: number; rows_skipped: string[] }
export interface GenerateReport { run_date: string; created: string[]; already_existed: string[]; skipped_children: string[]; warnings: string[] }

let token: string | null = sessionStorage.getItem('lg_token')

export function setToken(t: string | null) {
  token = t
  if (t) sessionStorage.setItem('lg_token', t)
  else sessionStorage.removeItem('lg_token')
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function detail(body: { detail?: unknown }): string {
  if (typeof body.detail === 'string') return body.detail
  if (Array.isArray(body.detail) && body.detail[0]?.msg) return String(body.detail[0].msg)
  return 'Request failed'
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server')
  }
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, detail(body))
  return body as T
}

const send = (method: string) => <T,>(path: string, data?: unknown) =>
  api<T>(path, { method, body: data === undefined ? undefined : data instanceof FormData ? data : JSON.stringify(data) })

export const post = send('POST')
export const patch = send('PATCH')
export const put = send('PUT')
export const del = send('DELETE')

export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong')

export const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' }) : ''
