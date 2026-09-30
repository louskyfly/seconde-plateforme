import { useState, useEffect } from 'react';
import { ChatView } from '@/components/chat/ChatView';
import { GroupChatView } from '@/components/chat/GroupChatView';
import { api } from '@/lib/api';
import { generateFingerprint } from '@/lib/utils';
import type { GroupChatConversation } from '@/types';

export default function Chat() {
  const [fingerprint] = useState(() => generateFingerprint());
  const [activeTab, setActiveTab] = useState<'class' | 'group'>('class');
  const [groupChat, setGroupChat] = useState<GroupChatConversation | null>(null);
  const [loadingGroup, setLoadingGroup] = useState(false);

  const loadMyGroup = async () => {
    setLoadingGroup(true);
    try {
      const { conversation } = await api.getMyGroupChat(fingerprint);
      setGroupChat(conversation);
      setActiveTab('group');
    } catch {
      setGroupChat(null);
    } finally {
      setLoadingGroup(false);
    }
  };

  // Au montage, essayer de charger le groupe
  useEffect(() => {
    loadMyGroup();
  }, [fingerprint]);

  return (
    <div className="flex flex-col h-full">
      {/* Onglets */}
      <div className="flex border-b mb-3">
        <button
          onClick={() => setActiveTab('class')}
          className={`flex-1 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === 'class'
              ? 'bg-indigo-500 text-white'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          💬 Classe
        </button>
        <button
          onClick={loadMyGroup}
          className={`flex-1 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === 'group'
              ? 'bg-indigo-500 text-white'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
          disabled={loadingGroup}
        >
          👥 Mon groupe
        </button>
      </div>

      {activeTab === 'class' && (
        <ChatView fingerprint={fingerprint} isAdmin={false} />
      )}

      {activeTab === 'group' && (
        <div className="flex-1">
          {groupChat ? (
            <GroupChatView
              fingerprint={fingerprint}
              groupId={groupChat.group_id}
              groupName={groupChat.group_name}
              onBack={() => setActiveTab('class')}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Tu n'as pas encore de groupe validé.
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
                Va dans l'onglet « Classe » → « Créer un groupe » pour en former un avec 3 ou 4 élèves.
                Une fois validé par le délégué, le chat de groupe apparaîtra ici.
              </p>
              <button
                onClick={loadMyGroup}
                disabled={loadingGroup}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {loadingGroup ? 'Recherche…' : 'Réessayer'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}