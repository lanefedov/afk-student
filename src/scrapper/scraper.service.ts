import { Injectable } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import { AnalyzerService } from '../analyzer/analyzer.service';
import { ParserService } from '../parser/parser.service';
import { ChatMessage } from '../parser/interfaces/chat-message';
import { Job } from 'agenda';

const USERNAME = 'user';
@Injectable()
export class ScraperService {
  private maxUsersCount: number = 0;
  constructor(
    private readonly analyzerService: AnalyzerService,
    private readonly parserService: ParserService,
  ) {}
  async attendLecture(
    job: Job,
    onConnect: (job: Job) => Promise<void>,
    setSaidHiFlag: (job: Job) => Promise<void>,
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const browser = await puppeteer.launch({
        headless: true,
        slowMo: 10,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      try {
        await page.goto(job.attrs.data.link);
        await page.locator('input[id*="join"]').fill(job.attrs.data.name);
        await page.locator('button[type="submit"]').click();

        const element = await page.waitForSelector(
          'button[aria-label="Listen only"], button[aria-label="Только слушать"]',
          {
            timeout: 10000,
          },
        );
        await element?.click();
        await onConnect(job);
        if (Date.now() - job.attrs.data.start.getTime() < 600000 && !job.attrs.data.alreadySaidHi) {
          //если опоздали на 10 минут, то Здравствуйте уже не говорим
          await Promise.all([this.sayHi(page), setSaidHiFlag(job)]);
        }

        const interval = setInterval(async () => {
          const [messages, count] = await Promise.all([this.getMessages(page), this.getUsersCount(page)]);

          if (this.analyzerService.isLastTwoMessagesGoodbye(messages)) {
            clearInterval(interval);
            await this.sayGoodbye(page);
            await page.close();
            resolve('Пару человек написали в чате "До свидания".');
          }

          if (count > this.maxUsersCount) {
            this.maxUsersCount = count;
          } else {
            if (this.maxUsersCount - count > 25) {
              clearInterval(interval);
              await page.close();
              resolve('С лекции ушло больше 25 человек.');
            }
          }

          if (job.attrs.data.end.getTime() <= Date.now()) {
            clearInterval(interval);
            await page.close();
            resolve('Время по расписанию подошло к концу.');
          }
        }, 5000);
      } catch (err) {
        await page.close();
        reject(err);
      }
    });
  }

  private async sayHi(page: Page): Promise<void> {
    const messages = await this.getMessages(page);
    if (this.analyzerService.didSayHi(USERNAME, messages)) return;

    await this.sendMessage(page, 'Здравствуйте!');
  }

  private async getHtmlBySelector(page: Page, selector: string): Promise<string | null> {
    return page.evaluate((selector) => {
      const el = document.querySelector(selector);
      return el ? el.outerHTML : null;
    }, selector);
  }

  private async sayGoodbye(page: Page): Promise<void> {
    const messages = await this.getMessages(page);

    if (this.analyzerService.didSayGoodbye(USERNAME, messages)) return;

    await this.sendMessage(page, 'До свидания!');
  }

  private async sendMessage(page: Page, message: string): Promise<void> {
    await page.locator('#message-input').fill(message);
    await page.locator('button[aria-label="Send message"], button[aria-label="Отправить сообщение"]').click();
  }

  private async getMessages(page: Page): Promise<ChatMessage[]> {
    const chatHTML = await this.getHtmlBySelector(page, 'div[data-test="chatMessages"]');
    return this.parserService.parseChat(chatHTML);
  }

  private async getUsersCount(page: Page): Promise<number> {
    const element = await page.$$("xpath/.//h2[contains(text(), 'Users')]");
    const html = await page.evaluate((el) => el.outerHTML, element[0]);

    return this.parserService.parseUsersCount(html);
  }

  async getRoomName(url: string): Promise<string | null> {
    let browser: Browser | undefined;

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page: Page = await browser.newPage();

    await page.goto(url);

    // Ждем загрузки элемента h1
    await page.waitForSelector('h1', { timeout: 10000 });

    // Получаем текст из h1
    const name = await page.$eval('h1', (el: Element) => el.textContent?.trim() || null);

    if (browser) {
      await browser.close();
    }

    return name;
  }
}
