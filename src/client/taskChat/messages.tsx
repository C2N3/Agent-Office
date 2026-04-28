import React, { type ReactElement } from 'react';
import { type ChatMessage, formatTime } from './model';

export function TaskChatMessages({
  messages,
  now,
}: {
  messages: ChatMessage[];
  now: number;
}): ReactElement {
  if (messages.length === 0) {
    return <div className="tc-empty">Send a message to start a task.</div>;
  }

  return (
    <>
      {messages.map((message) => {
        const time = formatTime(message.timestamp, now);
        if (message.kind === 'user') {
          return (
            <div key={message.id} className="tc-row tc-row-user">
              <div className="tc-bubble tc-bubble-user">{message.text}</div>
              <div className="tc-time">{time}</div>
            </div>
          );
        }
        if (message.kind === 'assistant-tool') {
          return (
            <div key={message.id} className="tc-row tc-row-assistant">
              <div className="tc-tool">
                <span className="tc-tool-icon">&gt;</span>
                <span>{message.text}</span>
              </div>
              <div className="tc-time">{time}</div>
            </div>
          );
        }
        if (message.kind === 'assistant-error') {
          return (
            <div key={message.id} className="tc-row tc-row-assistant">
              <div className="tc-error">{message.text}</div>
              <div className="tc-time">{time}</div>
            </div>
          );
        }
        if (message.kind === 'status') {
          return (
            <div key={message.id} className="tc-row tc-row-status">
              <div className="tc-status">{message.text}</div>
              <div className="tc-time">{time}</div>
            </div>
          );
        }
        return (
          <div key={message.id} className="tc-row tc-row-assistant">
            <div className="tc-bubble tc-bubble-assistant">{message.text}</div>
            <div className="tc-time">{time}</div>
          </div>
        );
      })}
    </>
  );
}
