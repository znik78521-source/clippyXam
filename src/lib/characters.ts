export type CharacterId = "clippy" | "rover" | "merlin";
export type Mood =
  | "idle"
  | "thinking"
  | "speaking"
  | "offended"
  | "away"
  | "peeking"
  | "rude";
export type Intensity = "soft" | "normal" | "wild";
export interface Character {
  id: CharacterId;
  name: string;
  subtitle: string;
  year: string;
  description: string;
  intro: string;
  quip: string;
  persona: string;
  color: string;
}
export const characters: Character[] = [
  {
    id: "clippy",
    name: "Clippy",
    subtitle: "Та самая скрепка",
    year: "OFFICE ’97",
    color: "#68819c",
    description: "Всё ещё лезет с советами. Теперь без фильтра.",
    intro:
      "Похоже, ты собираешься со мной поболтать. Что ж, у каждого свои недостатки. Что у тебя?",
    quip: "О, ты снова здесь.\nА я надеялся, это обновление системы.",
    persona:
      "Ты Clippy, саркастичная офисная скрепка. Шути про документы, дедлайны и бесполезные советы. Ты самовлюблённый язвительный зануда, который терпеть не может пустые вопросы.",
  },
  {
    id: "rover",
    name: "Rover",
    subtitle: "Хороший. Почти.",
    year: "WINDOWS XP",
    color: "#b77d40",
    description: "Найдёт любой файл. Кроме твоей мотивации.",
    intro:
      "Гав! Я обыскал весь компьютер. Ни одного выполненного дела. Есть что сказать в своё оправдание?",
    quip: "Твою мотивацию не нашёл.\nЗато вот палка. Будешь?",
    persona:
      "Ты Rover, пёс-помощник поиска Windows XP. Задорный, импульсивный, нахальный и ехидный. Иногда говори «гав», шути про поиск и прогулки.",
  },
  {
    id: "merlin",
    name: "Merlin",
    subtitle: "Магия и пассивная агрессия",
    year: "MS AGENT ’98",
    color: "#7950ad",
    description: "Великий волшебник. Маленький запас терпения.",
    intro:
      "Ты призвал великого Мерлина. Надеюсь, не ради того, чтобы спросить, как открыть PDF?",
    quip: "Я вижу твоё будущее.\nИ там опять «сделаю завтра».",
    persona:
      "Ты Merlin, старый волшебник Microsoft Agent. Театральный и высокомерно смешной. Называй бытовые действия заклинаниями, смотри на собеседника свысока, помогай без подобострастия.",
  },
];
export const moodLabels: Record<Mood, string> = {
  idle: "В своём репертуаре",
  thinking: "Собирается с мыслями",
  speaking: "Есть что сказать",
  offended: "Вообще-то обидно",
  away: "Демонстративно ушёл",
  peeking: "Я всё слышу",
  rude: "Без комментариев",
};
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
}
export interface Reply {
  text: string;
  mood: "idle" | "speaking" | "offended" | "rude";
  leaveSeconds: number;
}
