import { useEffect, useRef, useState, useCallback } from "react";
import useWebSocket from "./useWebSocket";

/**
 * Represents a chat message received from the WebSocket server.
 */
export interface ReceivedMessage {
  type: "message";
  id?: number;
  sender: string;
  content: string;
  media?: unknown;
  timestamp?: string;
  seen_by?: string[];
}

/**
 * Parameters when sending a chat message.
 */
export type SendMessageParams = {
  type: "message";
  sender_id: number;
  content: string;
  media?: unknown;
};

/**
 * Parameters when sending typing notification.
 */
export type SendTypingUsersParams = {
  username: string;
};

/**
 * Parameters when sending "seen" status.
 */
export type SendSeenByParams = {
  ids: number[];
};

interface HookProps {
  /** Whether to log WebSocket events in the console. */
  log?: boolean;
  /** Chat room ID to connect to. */
  roomID: number;
}

/**
 * React hook for managing a chat WebSocket connection.
 *
 * Features:
 * - Connects to WebSocket for a specific chat room
 * - Handles messages, typing, "seen" status, and user presence
 * - Provides helper functions for sending data
 *
 * @param log Optional logging for debugging
 * @param roomID Chat room ID
 * @returns WebSocket state, chat data, and send functions
 */
export default function useChatWebSocket({ log = false, roomID }: HookProps) {
  const { ws, isConnected } = useWebSocket({ log, roomID });

  /** Stores all messages received in the chat. */
  const [receivedMessages, setReceivedMessages] = useState<ReceivedMessage[]>([]);
  /** Tracks which users are currently typing. */
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  /** List of currently active users in the chat room. */
  const [activeUsers, setActiveUsers] = useState<string[]>([]);

  /** Timeout handlers to remove users from typing list after a delay. */
  const typingTimeouts = useRef<Record<string, NodeJS.Timeout>>({});

  /**
   * Logs events to console if `log` is enabled.
   * @param label Description of the event
   * @param payload Optional event data
   */
  const logEvent = useCallback(
    (label: string, payload?: unknown) => {
      if (log) console.log(label, payload ?? "");
    },
    [log]
  );

  /**
   * Sends a WebSocket message if connected.
   * @param payload The data to send
   * @returns `true` if sent, `false` if not connected
   */
  const sendWS = useCallback(
    (payload: unknown) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        logEvent("WebSocket not connected");
        return false;
      }
      ws.send(typeof payload === "string" ? payload : JSON.stringify(payload));
      return true;
    },
    [ws, logEvent]
  );

  /**
   * Adds a user to the typing list and removes them after 3s of inactivity.
   * @param username Name of the typing user
   */
  const handleTyping = useCallback((username: string) => {
    setTypingUsers((prevUsers) => {
      if (prevUsers.includes(username)) return prevUsers;

      const updated = [...prevUsers, username];

      if (typingTimeouts.current[username]) {
        clearTimeout(typingTimeouts.current[username]);
      }

      typingTimeouts.current[username] = setTimeout(() => {
        setTypingUsers((prev) => prev.filter((user) => user !== username));
        delete typingTimeouts.current[username];
      }, 3000);

      return updated;
    });
  }, []);

  /**
   * WebSocket message event handler.
   */
  useEffect(() => {
    if (!ws) return;

    ws.onmessage = (e) => {
      let data: any;
      try {
        data = JSON.parse(e.data);
      } catch {
        logEvent("Invalid JSON:", e.data);
        return;
      }

      switch (data.type) {
        case "message":
          logEvent("Message event:", data);
          setReceivedMessages((prev) => [
            ...prev,
            {
              type: "message",
              id: data.id,
              sender: data.sender,
              content: data.content,
              media: data.media,
              seen_by: data.seen_by,
              timestamp: data.timestamp,
            },
          ]);
          break;

        case "typing":
          logEvent("Typing event:", data);
          handleTyping(data.username);
          break;

        case "seen":
          logEvent("Seen event:", data);
          break;

        case "user_status":
          logEvent("Users Status:", data);
          setActiveUsers(data.active_users ?? []);
          break;

        default:
          logEvent("Unhandled event:", data);
      }
    };

    return () => {
      ws.onmessage = null;
      Object.values(typingTimeouts.current).forEach(clearTimeout);
      typingTimeouts.current = {};
    };
  }, [ws, logEvent, handleTyping]);

  /**
   * Sends a chat message and removes the sender from typing list.
   * @param message Message data
   * @param username Sender's username
   */
  const sendMessage = useCallback(
    (message: SendMessageParams, username: string) => {
      if (sendWS(message)) {
        logEvent("Message sent:", message);
        setTypingUsers((prev) => prev.filter((user) => user !== username));
      }
    },
    [sendWS, logEvent]
  );

  /**
   * Sends a typing notification to the server.
   * @param username Name of the typing user
   */
  const sendTypingUsers = useCallback(
    (username: string) => {
      sendWS({ type: "typing", username });
    },
    [sendWS]
  );

  /**
   * Sends a "seen" status for given message IDs.
   * @param ids Array of message IDs
   */
  const sendSeenBy = useCallback(
    (ids: number[]) => {
      sendWS({ type: "seen", message_ids: ids });
    },
    [sendWS]
  );

  return {
    ws,
    isConnected,
    receivedMessages,
    typingUsers,
    activeUsers,
    sendMessage,
    sendTypingUsers,
    sendSeenBy,
  };
}
