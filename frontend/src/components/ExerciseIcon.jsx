import { PersonSimpleRun, PersonSimpleBike, PersonSimpleSwim, PersonSimpleHike, PersonSimpleWalk, PersonSimpleTaiChi, BoxingGlove } from "@phosphor-icons/react";

// Stick-figure SVG icons (currentColor). Sized via parent w-/h-/text-color classes.
const Stroke = ({ children, size = 24 }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const PushupSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    {/* Head (now on right side - mirrored) */}
    <circle cx="27" cy="13" r="2" />
    {/* Body diagonal: head -> hips -> heels (mirrored) */}
    <line x1="25" y1="13" x2="12" y2="17" />
    <line x1="12" y1="17" x2="3" y2="20" />
    {/* Straight arm down to ground */}
    <line x1="23" y1="14" x2="21" y2="24" />
    {/* Second (further) arm */}
    <line x1="18" y1="15" x2="16" y2="24" />
    {/* Heel tick */}
    <line x1="3" y1="20" x2="3" y2="24" />
  </Stroke>
);

const PullupSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    {/* Bar */}
    <line x1="3" y1="5" x2="29" y2="5" />
    {/* Hands gripping (small ticks) */}
    <line x1="11" y1="3" x2="11" y2="7" />
    <line x1="21" y1="3" x2="21" y2="7" />
    {/* Arms bent up */}
    <polyline points="11,5 13,11 16,14" />
    <polyline points="21,5 19,11 16,14" />
    {/* Body */}
    <line x1="16" y1="14" x2="16" y2="23" />
    {/* Head */}
    <circle cx="16" cy="11.5" r="1.8" />
    {/* Legs slightly bent */}
    <polyline points="16,23 13,28" />
    <polyline points="16,23 19,28" />
  </Stroke>
);

const DipSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    {/* Head */}
    <circle cx="16" cy="5" r="2.5" />
    {/* Forward-leaning body: neck -> hips at bar */}
    <polyline points="15,7.5 13,12 10,18" />
    {/* Both arms bent BEHIND body - elbow points back-up-right (behind the lean) */}
    <polyline points="14,10 21,14 14,18" />
    <polyline points="13,11 20,15 13,18" />
    {/* Horizontal bar at hip level */}
    <line x1="3" y1="18" x2="23" y2="18" />
    {/* Legs hanging below bar, bent at knee */}
    <polyline points="10,18 13,24 10,29" />
  </Stroke>
);

const SquatSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    {/* Head (side view, facing right) */}
    <circle cx="20" cy="6" r="2.5" />
    {/* Body leaning forward */}
    <line x1="19" y1="8.5" x2="14" y2="16" />
    {/* Arm extended forward for balance */}
    <line x1="17" y1="11" x2="28" y2="11" />
    {/* Thigh: hip -> knee (going forward/down) */}
    <line x1="14" y1="16" x2="22" y2="22" />
    {/* Shin: knee -> ankle (going back/down) */}
    <line x1="22" y1="22" x2="16" y2="28" />
    {/* Foot tick — startet jetzt exakt am Shin-Ende (x=16), nicht mehr 2px daneben */}
    <line x1="16" y1="28" x2="21" y2="28" />
  </Stroke>
);

const HandstandSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    {/* Hand ticks (kleine Markierungen — keine Bodenlinie) */}
    <line x1="9" y1="27" x2="9" y2="29" />
    <line x1="23" y1="27" x2="23" y2="29" />
    {/* Straight arms from hands up to shoulders */}
    <line x1="9" y1="29" x2="14" y2="19" />
    <line x1="23" y1="29" x2="18" y2="19" />
    {/* Head — face pointing DOWN (between shoulders) */}
    <circle cx="16" cy="22" r="2.2" />
    {/* Body going straight UP from shoulders to hips */}
    <line x1="16" y1="19" x2="16" y2="9" />
    {/* Legs straight up, slightly spread */}
    <line x1="16" y1="9" x2="12" y2="3" />
    <line x1="16" y1="9" x2="20" y2="3" />
  </Stroke>
);

const BikeSvg = ({ size = 24 }) => (
  <PersonSimpleBike size={size} weight="bold" />
);

const SwimSvg = ({ size = 24 }) => (
  <PersonSimpleSwim size={size} weight="bold" />
);

const RunSvg = ({ size = 24 }) => (
  <PersonSimpleRun size={size} weight="bold" />
);

// ============ NEUE ICONS (Erweiterung) ============

const SitupSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    {/* Bodenlinie - Person sitzt komplett auf dem Boden */}
    <line x1="3" y1="24" x2="29" y2="24" strokeDasharray="2,2" />
    {/* Kopf - leicht angehoben links oben */}
    <circle cx="7" cy="11" r="2.2" />
    {/* Arme hinter dem Kopf verschränkt */}
    <polyline points="6,10 4,12 6,13.5" />
    {/* Oberkörper - schräg vom Kopf runter zum Po (auf dem Boden) */}
    <line x1="8" y1="12.5" x2="16" y2="23" />
    {/* Po / Hüfte am Boden (auf einer Linie mit den Füßen) */}
    <circle cx="16" cy="23" r="1" fill="currentColor" />
    {/* Oberschenkel hoch zum gebeugten Knie */}
    <line x1="16" y1="23" x2="22" y2="14" />
    {/* Unterschenkel runter zum Boden */}
    <line x1="22" y1="14" x2="25" y2="23" />
    {/* Fuß am Boden (auf gleicher Ebene wie der Po) */}
    <line x1="25" y1="23" x2="28" y2="23" />
  </Stroke>
);


// Burpee: der Strecksprung am Ende, Arme hoch, Füße in der Luft.
const BurpeeSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    <circle cx="16" cy="9" r="2.2" />
    <line x1="16" y1="11.2" x2="16" y2="20" />
    <polyline points="11,3.5 16,13 21,3.5" />
    <line x1="16" y1="20" x2="14" y2="26" />
    <line x1="16" y1="20" x2="18" y2="26" />
    <line x1="5" y1="29.5" x2="27" y2="29.5" strokeDasharray="2,2" />
  </Stroke>
);

const JumpSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    {/* Head */}
    <circle cx="16" cy="5" r="2.2" />
    {/* Body leicht nach vorne */}
    <line x1="16" y1="7.2" x2="15" y2="15" />
    {/* Beide Arme nach hinten (Schwung) */}
    <polyline points="15,10 10,12 8,17" />
    <polyline points="16,10 21,12 23,17" />
    {/* Oberschenkel angezogen */}
    <line x1="15" y1="15" x2="20" y2="20" />
    {/* Unterschenkel zurück (Knie gebeugt) */}
    <line x1="20" y1="20" x2="14" y2="23" />
  </Stroke>
);
const WalkSvg = ({ size = 24 }) => (
  <PersonSimpleWalk size={size} weight="bold" />
);

const HikeSvg = ({ size = 24 }) => (
  <PersonSimpleHike size={size} weight="bold" />
);

const YogaSvg = ({ size = 24 }) => (
  <PersonSimpleTaiChi size={size} weight="bold" />
);

const BoxSvg = ({ size = 24 }) => (
  <BoxingGlove size={size} weight="bold" />
);

const JumpRopeSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    {/* Volles Springseil - großer Bogen oben über dem Kopf */}
    <path d="M 6 16 Q 16 2 26 16" />
    {/* Springseil - unterer Bogen unter den Füßen (geschlossener Loop) */}
    <path d="M 6 16 Q 16 30 26 16" strokeDasharray="2,2" />
    {/* Griffe links und rechts (kleine Punkte) */}
    <circle cx="6" cy="16" r="1.2" fill="currentColor" />
    <circle cx="26" cy="16" r="1.2" fill="currentColor" />
    {/* Kopf */}
    <circle cx="16" cy="8" r="2" />
    {/* Körper */}
    <line x1="16" y1="10" x2="16" y2="19" />
    {/* Arme zu den Griffen */}
    <line x1="16" y1="13" x2="6" y2="16" />
    <line x1="16" y1="13" x2="26" y2="16" />
    {/* Beine - leicht angezogen (Sprungposition) */}
    <line x1="16" y1="19" x2="13" y2="24" />
    <line x1="16" y1="19" x2="19" y2="24" />
  </Stroke>
);
const WallSitSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    {/* Wand links — vertikale Linie */}
    <line x1="4" y1="3" x2="4" y2="29" />
    {/* Head — Rücken gegen Wand */}
    <circle cx="7" cy="7" r="2" />
    {/* Rücken gegen die Wand (vertikal nach unten) */}
    <line x1="7" y1="9" x2="7" y2="18" />
    {/* Oberschenkel — kürzer, horizontal nach rechts (90°) */}
    <line x1="7" y1="18" x2="16" y2="18" />
    {/* Unterschenkel — vertikal nach unten (90°) */}
    <line x1="16" y1="18" x2="16" y2="26" />
    {/* Arm liegt entspannt auf Oberschenkel */}
    <line x1="9" y1="16" x2="14" y2="17" />
    {/* Fuß */}
    <line x1="16" y1="26" x2="20" y2="26" />
  </Stroke>
);

const PlankSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    {/* Head links */}
    <circle cx="5" cy="13" r="2" />
    {/* Body — horizontal, leicht nach unten geneigt */}
    <line x1="7" y1="13" x2="27" y2="17" />
    {/* Unterarm 1 — vertikal vom Boden zur Schulter (Ellbogen am Boden) */}
    <line x1="8" y1="21" x2="9" y2="13.5" />
    {/* Unterarm-Tick (Ellbogen am Boden) */}
    <line x1="6" y1="21" x2="11" y2="21" />
    {/* Zweiter Unterarm */}
    <line x1="13" y1="21" x2="14" y2="14" />
    {/* Füße / Zehen */}
    <line x1="27" y1="17" x2="27" y2="21" />
  </Stroke>
);

const HollowHoldSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    {/* Head - leicht angehoben */}
    <circle cx="8" cy="16" r="1.8" />
    {/* Arme gestreckt nach oben/hinter Kopf */}
    <line x1="8" y1="16" x2="4" y2="12" />
    {/* Oberkörper/Rumpf leicht angehoben, Hintern am Boden */}
    <path d="M 10 16 Q 16 20 22 18" />
    {/* Hintern am Boden (Punkt) */}
    <circle cx="16" cy="20" r="0.8" fill="currentColor" />
    {/* Beine gestreckt, leicht angehoben */}
    <line x1="22" y1="18" x2="28" y2="16" />
    {/* Füße */}
    <line x1="28" y1="15" x2="28" y2="17" />
  </Stroke>
);


// Ausfallschritt, seitlich: vorderes Knie 90°, hinteres Knie kurz über dem Boden.
const LungeSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    <circle cx="16" cy="5" r="2.2" />
    <line x1="16" y1="7.2" x2="16" y2="16" />
    <polyline points="16,10 19,13 17,15.5" />
    <polyline points="16,16 23,17 23,26 26,26" />
    <polyline points="16,16 11,25 5,27" />
  </Stroke>
);

// Bergsteiger: Stütz mit gestreckten Armen, ein Knie zur Brust gezogen.
const MountainClimberSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    <circle cx="5.5" cy="10.5" r="2" />
    <line x1="8" y1="13" x2="29" y2="25" />
    <line x1="8" y1="13" x2="8" y2="25" />
    <line x1="5.5" y1="25" x2="10.5" y2="25" />
    <polyline points="18,18.7 12,21.5 15.5,25" />
  </Stroke>
);

// Kreuzheben: Hüfte gebeugt, gerade Arme, Hantelscheibe von der Seite.
const DeadliftSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    <circle cx="22" cy="7" r="2.2" />
    <line x1="20" y1="9" x2="11" y2="15" />
    <polyline points="11,15 15,21 12,28" />
    <line x1="18.5" y1="10" x2="19" y2="23" />
    <circle cx="19" cy="24" r="4" />
    <circle cx="19" cy="24" r="0.8" fill="currentColor" />
  </Stroke>
);

// Bankdrücken: liegend auf der Bank, Arme gestreckt nach oben, Scheibe oben.
const BenchSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    <line x1="7" y1="21" x2="26" y2="21" />
    <line x1="9" y1="21" x2="9" y2="27" />
    <line x1="24" y1="21" x2="24" y2="27" />
    <circle cx="26" cy="17" r="2" />
    <line x1="24" y1="18.5" x2="11" y2="18.5" />
    <polyline points="11,18.5 6,13 4,27" />
    <line x1="20" y1="18.5" x2="20" y2="10" />
    <circle cx="20" cy="7" r="3" />
  </Stroke>
);

// Schulterdrücken: stehend von vorn, Stange mit Scheiben über dem Kopf.
const OhpSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    <line x1="3" y1="5" x2="29" y2="5" />
    <line x1="5" y1="2" x2="5" y2="8" />
    <line x1="27" y1="2" x2="27" y2="8" />
    <circle cx="16" cy="11" r="2.2" />
    <polyline points="10,5 11,12 16,14 21,12 22,5" />
    <line x1="16" y1="13.2" x2="16" y2="21" />
    <line x1="16" y1="21" x2="12.5" y2="29" />
    <line x1="16" y1="21" x2="19.5" y2="29" />
  </Stroke>
);

// Rudern am Ergometer: sitzend, Beine gestreckt, Griff zur Brust gezogen.
const RowSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    <line x1="3" y1="27" x2="29" y2="27" />
    <circle cx="9" cy="9" r="2.2" />
    <line x1="9.5" y1="11.2" x2="12" y2="22" />
    <polyline points="12,22 19,18 26,23" />
    <line x1="27" y1="19" x2="27" y2="27" />
    <polyline points="10,14 6,18 14,18" />
    <line x1="14" y1="18" x2="26" y2="19" strokeDasharray="2,2" />
    <circle cx="12" cy="23.5" r="1" fill="currentColor" />
  </Stroke>
);

// Klettern: an der Wand, ein Arm zum oberen Griff, Fuß auf einem Tritt.
const ClimbSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    <line x1="28" y1="2" x2="28" y2="30" />
    <circle cx="25" cy="4" r="1.2" fill="currentColor" />
    <circle cx="24.5" cy="16" r="1.2" fill="currentColor" />
    <circle cx="25" cy="26" r="1.2" fill="currentColor" />
    <circle cx="15" cy="10" r="2.2" />
    <line x1="16" y1="12" x2="17" y2="20" />
    <polyline points="16,14 20,9 24,5" />
    <polyline points="16.5,15 21,17 23.5,16" />
    <polyline points="17,20 21,22 24,26" />
    <polyline points="17,20 14,25 15,29" />
  </Stroke>
);

// Treppensteigen: Figur auf Stufen.
const StairsSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    <polyline points="3,29 10,29 10,24 17,24 17,19 24,19 24,14 29,14" />
    <circle cx="17" cy="4" r="2" />
    <line x1="17" y1="6" x2="16" y2="12" />
    <polyline points="16,12 20,14.5 21,18" />
    <polyline points="16,12 13.5,17.5 13,23" />
    <polyline points="13,10 16.8,8 20,10.5" />
  </Stroke>
);

// Hängen (Dead Hang): Stange oben, Arme gestreckt, Körper hängt gerade.
const DeadHangSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    <line x1="3" y1="4" x2="29" y2="4" />
    <line x1="12" y1="4" x2="14" y2="13" />
    <line x1="20" y1="4" x2="18" y2="13" />
    <circle cx="16" cy="10" r="2" />
    <line x1="16" y1="12.5" x2="16" y2="21" />
    <line x1="16" y1="21" x2="15" y2="29" />
    <line x1="16" y1="21" x2="17" y2="29" />
  </Stroke>
);

// Gym (Aktivität): Kurzhantel.
const GymSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    <line x1="9" y1="16" x2="23" y2="16" />
    <rect x="5" y="10" width="4" height="12" rx="1" />
    <rect x="23" y="10" width="4" height="12" rx="1" />
    <line x1="2.5" y1="13" x2="2.5" y2="19" />
    <line x1="29.5" y1="13" x2="29.5" y2="19" />
  </Stroke>
);

// Sauna (Aktivität): Dampfwellen über einer Bank.
const SaunaSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    <path d="M9 4c-2 2 2 4 0 6M16 4c-2 2 2 4 0 6M23 4c-2 2 2 4 0 6" />
    <line x1="4" y1="18" x2="28" y2="18" />
    <line x1="4" y1="24" x2="28" y2="24" />
    <line x1="7" y1="18" x2="7" y2="28" />
    <line x1="25" y1="18" x2="25" y2="28" />
  </Stroke>
);

// ============ Registry ============

// Reihenfolge = Reihenfolge in der Icon-Auswahl (Settings): erst die häufigsten.
const REGISTRY = {
  run: RunSvg,
  pushup: PushupSvg,
  pullup: PullupSvg,
  squat: SquatSvg,
  bike: BikeSvg,
  swim: SwimSvg,
  walk: WalkSvg,
  hike: HikeSvg,
  situp: SitupSvg,
  dip: DipSvg,
  burpee: BurpeeSvg,
  lunge: LungeSvg,
  plank: PlankSvg,
  mountainclimber: MountainClimberSvg,
  handstand: HandstandSvg,
  deadhang: DeadHangSvg,
  wallsit: WallSitSvg,
  hollow: HollowHoldSvg,
  jump: JumpSvg,
  jumprope: JumpRopeSvg,
  stairs: StairsSvg,
  row: RowSvg,
  deadlift: DeadliftSvg,
  bench: BenchSvg,
  ohp: OhpSvg,
  climb: ClimbSvg,
  box: BoxSvg,
  yoga: YogaSvg,
  gym: GymSvg,
  sauna: SaunaSvg,
};

// Alte Daten: "sprint"/"hspu" waren Handstand, "legraise" zeigte das Springseil.
const ALIASES = {
  sprint: "handstand",
  hspu: "handstand",
  legraise: "jumprope",
};

export const ICON_KEYS = Object.keys(REGISTRY);

export default function ExerciseIcon({ icon = "pushup", size = 20, className = "" }) {
  const resolved = ALIASES[icon] || icon;
  const Cmp = REGISTRY[resolved] || REGISTRY.pushup;
  return <span className={className}><Cmp size={size} /></span>;
}