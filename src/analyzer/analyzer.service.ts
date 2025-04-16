import { Injectable } from '@nestjs/common';
import { ChatMessage } from '../parser/interfaces/chat-message';

@Injectable()
export class AnalyzerService {
  isLastTwoMessagesGoodbye(messages: ChatMessage[]): boolean {
    if (messages.length < 2) return false;

    const lastTwoMessages = messages.slice(-2);
    return lastTwoMessages.every((m) => m.content.toLowerCase().includes('до свидания'));
  }

  isUsersCountDropped(lastCount: number, currentCount: number): boolean {
    return false;
  }

  didSaySomething(username: string, messages: ChatMessage[], something: string): boolean {
    for (const message of messages) {
      if (message.author === username && message.content.toLowerCase().includes(something.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  didSayHi(username: string, messages: ChatMessage[]): boolean {
    return this.didSaySomething(username, messages, 'здравствуйте');
  }

  didSayGoodbye(username: string, messages: ChatMessage[]): boolean {
    return this.didSaySomething(username, messages, 'до свидания');
  }
}
