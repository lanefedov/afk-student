import { Injectable, OnApplicationBootstrap, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Agenda, Job } from 'agenda';
import { ConfigService } from '@nestjs/config';
import { ObjectId } from 'mongodb';
import { ScraperService } from '../scrapper/scraper.service';
import * as console from 'node:console';

@Injectable()
export class AgendaService implements OnModuleDestroy, OnApplicationBootstrap {
  async onApplicationBootstrap(): Promise<void> {
    await this.reviveUnfinishedLectures();
    await this.agenda.start();
  }
  private readonly agenda: Agenda;

  constructor(
    private configService: ConfigService,
    private readonly scraperService: ScraperService,
  ) {
    this.agenda = new Agenda({
      db: { address: this.configService.getOrThrow<string>('MONGO_URI') },
      processEvery: '30 seconds', // Интервал обработки задач
      defaultLockLifetime: 2 * 60 * 60 * 1000, // 2 часа
    });
    this.agenda.define('attend-lecture', (job: Job, done: () => void) => {
      this.scraperService.attendLecture(job, done);
    });
  }

  // Метод для создания задачи
  async scheduleJob(when: string | Date, name: string, data: any): Promise<void> {
    await this.agenda.schedule(when, name, data);
  }

  async reviveUnfinishedLectures() {
    await this.agenda._ready;
    const unfinishedJobs = await this.agenda._collection
      .find({
        name: 'attend-lecture',
        lockedAt: { $ne: null },
        lastFinishedAt: null,
        'data.end': { $gte: new Date() }, // Лекция ещё не завершилась
      })
      .toArray();

    for (const job of unfinishedJobs) {
      console.log(`Reviving job ${job._id}`);
      await this.agenda._collection.updateOne(
        { _id: job._id },
        {
          $set: {
            lockedAt: null,
            nextRunAt: new Date(),
          },
        },
      );
    }
  }

  async getList(userId: number) {
    // await this.agenda._collection.createIndex({ nextRunAt: 1 });
    return (await this.agenda._collection
      .find({
        name: 'attend-lecture',
        nextRunAt: { $ne: null },
        'data.userId': userId,
      })
      .sort({ nextRunAt: 1 })
      .toArray()) as any[];
  }

  async deleteLecture(_id: string): Promise<boolean> {
    const { deletedCount } = await this.agenda._collection.deleteOne({ _id: new ObjectId(_id) });

    return deletedCount > 0;
  }

  async onModuleDestroy() {
    await this.agenda.stop();
  }
}
