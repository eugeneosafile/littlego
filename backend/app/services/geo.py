"""Small geometry helpers for route-deviation checks. No PostGIS needed for the MVP."""
from math import asin, cos, radians, sin, sqrt

EARTH_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * EARTH_KM * asin(sqrt(a))


def _point_segment_km(p: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
    # Project onto a local flat plane (accurate enough over a city).
    k = cos(radians(p[0]))
    ax, ay = a[1] * k, a[0]
    bx, by = b[1] * k, b[0]
    px, py = p[1] * k, p[0]
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        t = 0.0
    else:
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    cx, cy = ax + t * dx, ay + t * dy
    return haversine_km(p[0], p[1], cy, cx / k)


def distance_to_route_km(point: tuple[float, float], route: list[tuple[float, float]]) -> float:
    """Shortest distance from a point to a route drawn through the given stops in order."""
    if len(route) == 1:
        return haversine_km(point[0], point[1], route[0][0], route[0][1])
    return min(_point_segment_km(point, route[i], route[i + 1]) for i in range(len(route) - 1))
