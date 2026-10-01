import { Mascot } from '@/components/mascot/mascot';

/** The chat while its page is prepared: the mascot and the empty message box, in the places they will be. */
export default function CompanionLoading() {
  return <div className="chat-page" aria-busy="true" aria-label="Loading chat">
    <div className="chat-shell is-empty">
      <div className="chat-thread">
        <div className="chat-empty"><Mascot pose="thinking" size={64} className="chat-mascot" /></div>
      </div>
      <div className="chat-dock"><div className="chat-composer chat-composer-skeleton" /></div>
    </div>
  </div>;
}
