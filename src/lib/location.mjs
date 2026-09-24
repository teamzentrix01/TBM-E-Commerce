/** Shared browser geolocation helpers for store resolution. */

export const MAX_DELIVERY_KM = 5;

export function getCurrentCoordinates(options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location is not supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          locationAccuracyM: coords.accuracy,
        }),
      () =>
        reject(
          new Error(
            "Please allow location access to find a Buyzaar Mart within 5 km.",
          ),
        ),
      {
        enableHighAccuracy: true,
        timeout: options.timeout ?? 15000,
        maximumAge: options.maximumAge ?? 0,
      },
    );
  });
}

export function assertStoreWithinRadius(store, maxKm = MAX_DELIVERY_KM) {
  const distance = Number(store?.delivery_distance_km);
  const radius = Math.min(Number(store?.delivery_radius_km || maxKm), maxKm);
  if (!store || !Number.isFinite(distance) || distance > radius) {
    throw new Error(
      "Sorry, no Buyzaar Mart store is available within 5 km of your current location.",
    );
  }
  return { distance, radius };
}
