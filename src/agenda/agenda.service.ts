import { Injectable, OnApplicationBootstrap, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Agenda, Job } from 'agenda';
import { ConfigService } from '@nestjs/config';
import { ObjectId } from 'mongodb';
import { ScraperService } from '../scrapper/scraper.service';
import * as console from 'node:console';
import { NotificationService } from '../notification/notification.service';

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
    private readonly notificationService: NotificationService,
  ) {
    this.agenda = new Agenda({
      db: { address: this.configService.getOrThrow<string>('MONGO_URI') },
      processEvery: '30 seconds', // Интервал обработки задач
      defaultLockLifetime: 2 * 60 * 60 * 1000, // 2 часа
    });
    // this.agenda.define('attend-lecture', async (job: Job<{ userId: number; retriesCount: number }>) => {
    //   if (job.attrs.data.retriesCount < 3)
    //     try {
    //       const reason = await this.scraperService.attendLecture(job, () =>
    //         this.notificationService.notifyOnLectureConnectionSuccess(
    //           job.attrs.data.userId,
    //           job.attrs.data.retriesCount,
    //         ),
    //       );
    //       await this.notificationService.notifyOnLectureDisconnection(job.attrs.data.userId, reason);
    //       return;
    //     } catch (err) {
    //       console.error(err);
    //       await Promise.all([
    //         this.notificationService.notifyOnLectureConnectionFailure(
    //           job.attrs.data.userId,
    //           job.attrs.data.retriesCount,
    //         ),
    //         this.agenda._collection.updateOne(
    //           { _id: job.attrs._id },
    //           { $set: { nextRunAt: new Date(Date.now() + 5 * 60000), retriesCount: job.attrs.data.retriesCount + 1 } },
    //         ),
    //       ]);
    //     }
    // });
    this.agenda.define(
      'attend-lecture',
      async (job: Job<{ userId: number; retriesCount: number; roomName: string; alreadySaidHi: boolean }>) => {
        const { userId, retriesCount = 0, roomName } = job.attrs.data;

        try {
          const reason = await this.scraperService.attendLecture(
            job,
            this.onConnect.bind(this),
            this.setSaidHiFlag.bind(this),
          );

          await this.notificationService.notifyOnLectureDisconnection(userId, reason, roomName);
        } catch (err) {
          console.error(err);

          await this.notificationService.notifyOnLectureConnectionFailure(userId, retriesCount, roomName);

          if (retriesCount < 3) {
            job.attrs.data.retriesCount = retriesCount + 1;
            job.attrs.nextRunAt = new Date(Date.now() + 5 * 60 * 1000);
            await job.save();
          } else {
            console.log(`Job failed after ${retriesCount} retries.`);
          }
        }
      },
    );
  }
  private async onConnect(job: Job<{ userId: number; retriesCount: number; roomName: string }>): Promise<void> {
    const { userId, retriesCount = 0, roomName } = job.attrs.data;
    await this.notificationService.notifyOnLectureConnectionSuccess(userId, retriesCount, roomName);
  }
  private async setSaidHiFlag(job: Job<{ alreadySaidHi: boolean }>): Promise<void> {
    job.attrs.data.alreadySaidHi = true;
    await job.save();
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
        // lastFinishedAt: null,
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
