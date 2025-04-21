import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';

@Injectable()
export class NotificationService {
  constructor(@InjectBot() private readonly bot: Telegraf<Context>) {}

  private async sendMessage(userId: number | string, message: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(userId, message, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      console.error(`Failed to send message to ${userId}:`, error);
    }
  }

  private getRetryEmojiIndicator(retriesCount: number, success: boolean): string {
    if (success) {
      switch (retriesCount) {
        case 0:
          return '';
        case 1:
          return '❌✅⚪️';
        default:
          return '❌❌✅';
      }
    }

    switch (retriesCount) {
      case 0:
        return '❌⚪️⚪️';
      case 1:
        return '❌❌⚪️';
      default:
        return '❌❌❌';
    }
  }

  async notifyOnLectureConnectionSuccess(userId: number, retriesCount: number, roomName: string): Promise<void> {
    const indicator = this.getRetryEmojiIndicator(retriesCount, true);
    const message = `<b>✅ Подключился к лекции "${roomName}"</b>

${indicator}`;
    await this.sendMessage(userId, message);
  }

  async notifyOnLectureConnectionFailure(userId: number, retriesCount: number, roomName: string): Promise<void> {
    const indicator = this.getRetryEmojiIndicator(retriesCount, false);
    const message = `<b>❌ Не удалось подключиться к лекции "${roomName}"</b>

${indicator}
${retriesCount < 2 ? 'Возможно преподаватель еще не начал. Попробую зайти через 5 минут!' : ''}`;
    await this.sendMessage(userId, message);
  }

  async notifyOnLectureDisconnection(userId: number, reason: string, roomName: string): Promise<void> {
    const message = `<b>ℹ️ Отключился от лекции "${roomName}"</b>

Признак окончания: ${reason}`;
    await this.sendMessage(userId, message);
  }
}
