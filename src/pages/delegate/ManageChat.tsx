import { ChatView } from '@/components/chat/ChatView';
import { ChatDayDelete } from '@/components/delegate/ChatDayDelete';
import { ChatMembers } from '@/components/delegate/ChatMembers';

export default function ManageChat() {
  return (
    <div className="space-y-3">
      <ChatMembers />
      <ChatDayDelete />
      <ChatView fingerprint={null} isAdmin />
    </div>
  );
}
