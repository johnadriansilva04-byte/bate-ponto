// Leitura do GPS. Nunca trava o ponto: se o sinal nao vier rapido, o registro
// segue sem coordenada e o motivo fica gravado em start_geo_status/end_geo_status.
// O aplicativo so guarda o que o aparelho informou; nao inventa posicao.

export type GeoStatus = "ok" | "negado" | "indisponivel" | "expirado" | "sem_suporte";

export type GeoFix = {
  latitude: number | null;
  longitude: number | null;
  status: GeoStatus;
  /** Precisao em metros, quando o aparelho informa. */
  accuracy: number | null;
};

const NO_GEO: GeoFix = { latitude: null, longitude: null, status: "indisponivel", accuracy: null };

/** Espera no maximo `timeoutMs`; passou disso, segue sem coordenada. */
export function getPosition(timeoutMs = 8000): Promise<GeoFix> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ ...NO_GEO, status: "sem_suporte" });
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (fix: GeoFix) => {
      if (!done) {
        done = true;
        resolve(fix);
      }
    };
    const timer = setTimeout(() => finish({ ...NO_GEO, status: "expirado" }), timeoutMs + 500);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        finish({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          status: "ok",
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        });
      },
      (err) => {
        clearTimeout(timer);
        finish({ ...NO_GEO, status: err.code === err.PERMISSION_DENIED ? "negado" : "indisponivel" });
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    );
  });
}

/** Texto curto para a tela, no lugar de coordenada quando nao houve sinal. */
export function geoLabel(status?: string | null): string {
  switch (status) {
    case "ok":
      return "Local registrado";
    case "negado":
      return "Permissão de local negada";
    case "expirado":
      return "Sem sinal de GPS na hora";
    case "sem_suporte":
      return "Aparelho sem GPS";
    default:
      return "Local não registrado";
  }
}

/** "‑23.5505, ‑46.6333" para a ficha impressa. */
export function formatCoords(lat?: number | null, lng?: number | null): string {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return "—";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
