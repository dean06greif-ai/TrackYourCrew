// Workout-Musik-Player (Dean 2026-11-26): Musik-Symbol oben rechts; läuft Musik, tanzen kleine Wellen darüber.
// Antippen öffnet ein dezentes Fenster (Spotify-artig): Playlist wählen, Lied zurück/vor, Play/Pause,
// Fortschritt des Lieds, Lautstärke und die Credits des laufenden Lieds (CC BY 4.0 – Pflichtangaben).
// Schließt beim Scrollen, Antippen daneben oder Esc – die Musik läuft weiter (lib/musicPlayer).
import { useEffect, useRef, useState } from "react";
import { MusicNotesSimple, Play, Pause, SkipBack, SkipForward, SpeakerHigh, SpeakerSlash, ArrowSquareOut } from "@phosphor-icons/react";
import { useI18n } from "../i18n";
import { formatClock } from "../lib/stopwatch";
import { useMusic, loadMusic, musicData, trackAt, toggle, next, prev, choosePlaylist, seekInTrack, setVolume } from "../lib/musicPlayer";

function Waves({ playing, className = "" }) {
  return (
    <span className={`flex items-end gap-[2px] h-3 ${className}`} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`w-[2px] rounded-full bg-[#CCFF00] ${playing ? "music-bar" : ""}`} style={{ height: playing ? undefined : "3px", animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

export default function MusicButton() {
  const { t } = useI18n();
  const m = useMusic();
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  useEffect(() => { loadMusic(); }, []);

  // Schließen: daneben tippen, Esc, Scrollen (Musik läuft weiter)
  useEffect(() => {
    if (!open) return undefined;
    const y0 = window.scrollY;
    const down = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") setOpen(false); };
    const scroll = () => { if (Math.abs(window.scrollY - y0) > 40) setOpen(false); };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll);
    };
  }, [open]);

  const data = musicData();
  const pl = data?.playlists.find((p) => p.id === m.plId) || data?.playlists[0];
  const { index, track } = trackAt(pl, m.time);
  const dur = track ? track.end - track.start : 0;
  const pos = track ? Math.max(0, Math.min(dur, m.time - track.start)) : 0;

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("music.title")}
        aria-expanded={open}
        title={t("music.title")}
        data-testid="music-button"
        className={`relative border px-2.5 md:px-3 py-2 flex items-center justify-center transition-colors ${m.playing ? "border-[#CCFF00]/60 text-[#CCFF00]" : "border-[#222] text-white hover:border-[#CCFF00] hover:text-[#CCFF00]"}`}
      >
        <MusicNotesSimple size={16} weight={m.playing ? "fill" : "bold"} />
        {m.playing && <Waves playing className="absolute -top-2 left-1/2 -translate-x-1/2" />}
      </button>

      {open && (
        <div className="fixed inset-x-4 top-[4.5rem] md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-2 md:w-80 bg-[#121212] border border-[#2A2A2A] shadow-[0_12px_40px_rgba(0,0,0,0.6)] z-50" data-testid="music-panel">
          {!pl ? (
            <p className="p-4 text-xs text-ink-3">{t("music.loading")}</p>
          ) : (
            <>
              {/* Playlisten */}
              <div className="flex gap-1.5 p-3 pb-0">
                {data.playlists.map((p) => (
                  <button key={p.id} type="button" onClick={() => choosePlaylist(p.id)} data-testid={`music-pl-${p.id}`}
                    className={`flex-1 rounded-full px-2 py-1.5 text-[11px] font-semibold transition-colors ${p.id === pl.id ? "bg-[#CCFF00] text-black" : "bg-[#1F1F1F] text-ink-2 hover:text-white"}`}>
                    {t(`music.pl.${p.id}`)}
                  </button>
                ))}
              </div>

              {/* Läuft gerade */}
              <div className="flex items-center gap-3 px-3 pt-3">
                <div className="w-11 h-11 shrink-0 bg-gradient-to-br from-[#CCFF00]/25 to-[#1F1F1F] flex items-center justify-center">
                  {m.playing ? <Waves playing /> : <MusicNotesSimple size={18} className="text-[#CCFF00]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate" data-testid="music-title">{track?.title}</p>
                  <p className="text-xs text-ink-2 truncate" data-testid="music-artist">{track?.artist}</p>
                </div>
                <span className="text-[10px] text-ink-3 tabular-nums shrink-0">{index + 1}/{pl.tracks.length}</span>
              </div>

              {/* Fortschritt des Lieds (antippen = springen) */}
              <div className="px-3 pt-3">
                <div className="h-1 bg-[#333] rounded-full cursor-pointer group" data-testid="music-progress"
                  onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seekInTrack((e.clientX - r.left) / r.width); }}>
                  <div className="h-full bg-white group-hover:bg-[#CCFF00] rounded-full" style={{ width: `${dur ? (pos / dur) * 100 : 0}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-ink-3 tabular-nums mt-1">
                  <span>{formatClock(Math.floor(pos))}</span><span>{formatClock(Math.floor(dur))}</span>
                </div>
              </div>

              {/* Steuerung */}
              <div className="flex items-center justify-center gap-6 py-2">
                <button type="button" onClick={prev} aria-label={t("music.prev")} className="text-ink-2 hover:text-white" data-testid="music-prev"><SkipBack size={20} weight="fill" /></button>
                <button type="button" onClick={toggle} aria-label={m.playing ? t("music.pause") : t("music.play")}
                  className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform" data-testid="music-toggle">
                  {m.playing ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" className="ml-0.5" />}
                </button>
                <button type="button" onClick={next} aria-label={t("music.next")} className="text-ink-2 hover:text-white" data-testid="music-next"><SkipForward size={20} weight="fill" /></button>
              </div>

              {/* Lautstärke */}
              <div className="flex items-center gap-2 px-3 pb-2">
                <button type="button" onClick={() => setVolume(m.volume > 0 ? 0 : 0.7)} aria-label={t("music.volume")} className="text-ink-3 hover:text-white">
                  {m.volume > 0 ? <SpeakerHigh size={14} /> : <SpeakerSlash size={14} />}
                </button>
                <input type="range" min="0" max="1" step="0.05" value={m.volume} onChange={(e) => setVolume(Number(e.target.value))} className="flex-1 h-1 accent-[#CCFF00]" aria-label={t("music.volume")} data-testid="music-volume" />
              </div>

              {/* Credits des laufenden Lieds (CC BY 4.0: Urheber, Titel, Quelle, Lizenz, Bearbeitung) */}
              {track && (
                <p className="border-t border-[#222] px-3 py-2 text-[10px] leading-relaxed text-ink-3" data-testid="music-credits">
                  „{track.title}“ – {track.artist}
                  {track.source && <> · <a href={track.source} target="_blank" rel="noopener noreferrer" className="hover:text-white underline-offset-2 hover:underline">{t("music.source")}</a></>}
                  {" · "}<a href={data.license.url} target="_blank" rel="noopener noreferrer" className="hover:text-white underline-offset-2 hover:underline">{data.license.name}</a>
                  {" · "}{t("music.edited")}
                  {" · "}<a href="/music/Workout-Musik-Credits.txt" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-white">{t("music.allCredits")}<ArrowSquareOut size={10} /></a>
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
