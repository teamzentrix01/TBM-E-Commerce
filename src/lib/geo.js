const EARTH_RADIUS_KM = 6371;

export function distanceKm(latitude1, longitude1, latitude2, longitude2) {
  if (
    [latitude1, longitude1, latitude2, longitude2].some(
      (value) => value == null || String(value).trim() === "",
    )
  ) {
    return null;
  }
  const values = [latitude1, longitude1, latitude2, longitude2].map(Number);
  if (!values.every(Number.isFinite)) return null;
  const [lat1Value, lng1Value, lat2Value, lng2Value] = values;
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const lat1 = radians(lat1Value);
  const lat2 = radians(lat2Value);
  const latitudeDelta = radians(lat2Value - lat1Value);
  const longitudeDelta = radians(lng2Value - lng1Value);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
