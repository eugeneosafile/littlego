import { useEffect, useState } from 'react'
import { api, type School } from '../../api'

export function useSchools(reloadKey = 0) {
  const [schools, setSchools] = useState<School[]>([])
  useEffect(() => { api<School[]>('/admin/schools').then(setSchools).catch(() => {}) }, [reloadKey])
  return schools
}
