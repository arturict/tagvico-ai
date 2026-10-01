import { Mascot } from '@/components/mascot/mascot';

/** The "the answer is on its way" row: the mascot at work next to a shimmering line. */
export function ChatWorking({ label }: { label: string }) {
  return <div className="chat-working">
    <Mascot pose="thinking" size={32} />
    <span className="shimmer">{label}</span>
  </div>;
}
