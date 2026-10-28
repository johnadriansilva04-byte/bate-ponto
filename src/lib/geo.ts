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
        finish({
          ...NO_GEO,
          status: err.code === err.PERMISSION_DENIED ? "negado" : "indisponivel",
        });
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

/** Local previsto cadastrado: onde ele costuma trabalhar. */
export type LocalPrevisto = {
  endereco: string;
  latitude: number | null;
  longitude: number | null;
  raioMetros: number;
};

/**
 * Distancia em metros entre dois pontos (formula de haversine). A Terra nao e
 * uma esfera perfeita, mas o erro de poucos metros nao muda a resposta a
 * pergunta "ele esta longe do local?".
 */
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type AvaliacaoLocal = {
  /** true so quando ha como provar que o toque foi longe do previsto. */
  fora: boolean;
  /** Distancia em metros, ou null quando nao deu para calcular. */
  distancia: number | null;
};

/**
 * O toque aconteceu fora do local previsto?
 *
 * Regra de ouro: sem coordenada do toque, ou sem coordenada cadastrada no
 * local, a resposta e `fora: false`. O aplicativo nunca acusa alguem por falta
 * de sinal de GPS — a ausencia de dado nao e prova de ausencia no lugar.
 */
export function avaliarLocal(fix: GeoFix | null, local: LocalPrevisto | null): AvaliacaoLocal {
  if (!fix || fix.status !== "ok" || fix.latitude === null || fix.longitude === null) {
    return { fora: false, distancia: null };
  }
  if (!local || local.latitude === null || local.longitude === null) {
    return { fora: false, distancia: null };
  }
  const distancia = distanceMeters(fix.latitude, fix.longitude, local.latitude, local.longitude);
  return { fora: distancia > local.raioMetros, distancia };
}

/** "2,3 km" ou "340 m" — distancia para caber na tela sem numero comprido. */
export function formatDistancia(metros: number): string {
  if (metros >= 1000) {
    const km = metros / 1000;
    return `${km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
  }
  return `${Math.round(metros)} m`;
}

/**
 * Dados do aviso vermelho, quando o toque foi longe do previsto.
 * `null` quando nao ha o que avisar.
 */
export type AvisoFora = {
  fix: GeoFix;
  previsto: LocalPrevisto;
  distancia: number;
  /** Qual dos dois toques aconteceu fora. */
  toque: "entrada" | "saida";
};

/**
 * Decide se o aviso vermelho deve aparecer depois de um toque.
 *
 * O aviso so existe com prova: GPS bom no toque E coordenada cadastrada no
 * local. Falta de sinal nunca vira acusacao — mesma regra de `avaliarLocal`.
 * O ponto e registrado de qualquer forma; o aviso apenas informa.
 */
export function decidirAviso(
  fix: GeoFix | null,
  local: LocalPrevisto | null,
  eraFinalizar: boolean,
): AvisoFora | null {
  const { fora, distancia } = avaliarLocal(fix, local);
  if (!fora || distancia === null || !fix || !local) return null;
  return { fix, previsto: local, distancia, toque: eraFinalizar ? "saida" : "entrada" };
}

/**
 * Nome do lugar a partir da coordenada, para o aviso dizer ONDE ele registrou,
 * e nao apenas numeros. Usa o servico publico do OpenStreetMap e nunca lanca:
 * sem internet, ou demorando, devolve null e a tela mostra as coordenadas.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  timeoutMs = 6000,
): Promise<string | null> {
  if (typeof fetch !== "function") return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=0` +
      `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const j = (await res.json()) as { display_name?: unknown };
    const nome = typeof j.display_name === "string" ? j.display_name.trim() : "";
    return nome.length > 0 ? nome : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
