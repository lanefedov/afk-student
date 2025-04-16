import { Injectable } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import { ChatMessage } from './interfaces/chat-message';

@Injectable()
export class ParserService {
  parseChat(html?: string | null): ChatMessage[] {
    if (!html) return [];

    // Create a JSDOM instance
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const messageElements = document.querySelectorAll('[data-test="msgListItem"]');

    const messages: ChatMessage[] = [];

    messageElements.forEach((element) => {
      // Skip the welcome message (it has different structure)
      if (element.querySelector('[data-test="chatWelcomeMessageText"]')) {
        return;
      }

      const authorElement = element.querySelector('.sc-ljHdwo.ccGJef span');
      const timeElement = element.querySelector('time');
      const contentElement = element.querySelector('[data-test="chatUserMessageText"]');

      if (authorElement && timeElement && contentElement) {
        messages.push({
          author: authorElement.textContent?.trim() || '',
          time: timeElement.textContent?.trim() || '',
          content: contentElement.textContent?.trim() || '',
        });
      }
    });

    return messages;
  }

  parseUsersCount(html?: string | null): number {
    if (!html) return 0;

    // Regular expression to match a number inside parentheses
    const regex = /\((\d+)\)/;
    const match = html.match(regex);

    if (match && match[1]) {
      return parseInt(match[1], 10);
    }

    return 0;
  }
}
