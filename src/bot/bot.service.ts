import { Injectable } from '@nestjs/common';
import { Ctx, Start, Update, Command, On, InjectBot } from 'nestjs-telegraf';
import { Context, Markup, Telegraf } from 'telegraf';
import { AgendaService } from '../agenda/agenda.service';
import * as moment from 'moment-timezone';
import * as Joi from 'joi';
import { ScraperService } from '../scrapper/scraper.service';
import { ValidationResult } from './interfaces/validation-result.interface';
import { getSamaraDateTimeNow } from '../utils';

interface Lecture {
  date: string;
  timeSlot: string;
  link: string;
  name: string;
  roomName: string;
}

const TIME_SLOTS = [
  '08:00-09:35',
  '09:45-11:20',
  '11:30-13:05',
  '13:30-15:05',
  '15:15-16:50',
  '17:00-18:35',
  'Кастомное время',
];

const CUSTOM_TIMES = [
  // '08:00',
  // '08:30',
  // '09:00',
  // '09:30',
  // '10:00',
  // '10:30',
  // '11:00',
  // '11:30',
  // '12:00',
  // '12:30',
  // '13:00',
  // '13:30',
  // '14:00',
  // '14:30',
  // '15:00',
  // '15:30',
  // '16:00',
  // '16:30',
  // '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
  '19:30',
  '20:00',
  '20:30',
  '21:00',
  '21:30',
  '22:00',
  '22:30',
  '23:30',
];

@Injectable()
@Update()
export class BotService {
  private state = new Map<number, any>();
  private mainMenu = Markup.keyboard([['/add'], ['/list'], ['/delete']])
    .oneTime()
    .resize();

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>, //проверить будет ли работать, если убрать
    private readonly agendaService: AgendaService,
    private readonly scraperService: ScraperService,
  ) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    await ctx.reply(
      `👋 Привет, ${ctx.from?.first_name!}!

Я зайду за тебя на лекцию. Вот мои команды:

1. 📅 Добавить лекцию для посещения — /add
2. 📖 Посмотреть запланированные посещения — /list
3. ❌ Отменить  посещение — /delete`,
    );
  }

  @Command('add')
  async onAddLecture(@Ctx() ctx: Context) {
    console.log({ username: ctx.from?.username });
    const userId = ctx.from?.id!;
    this.state.set(userId, { step: 'date' });
    await ctx.reply('Введите дату лекции в формате ММ-ДД');
  }

  @Command('list')
  async onListLectures(@Ctx() ctx: Context) {
    const lectures = await this.agendaService.getList(ctx.from?.id!);

    if (lectures.length === 0) {
      await ctx.reply('У вас пока нет запланированных лекций.', this.mainMenu);
      return;
    }

    const messages = lectures.map(
      (lecture, i) =>
        /* `${i + 1}. 📅 ${lecture.data.date} ${lecture.data.timeSlot}\n🔗 ${lecture.data.link}\n👤 ${lecture.data.name}`, */
        `${i + 1}.\n📅 ${lecture.data.date}\n🕒 ${lecture.data.timeSlot}\n💻 ${lecture.data.roomName}\n🔗 ${lecture.data.link}\n👤 ${lecture.data.name}`,
    );
    await ctx.reply(messages.join('\n\n'), this.mainMenu);
  }

  @Command('delete')
  async onDeleteLecture(@Ctx() ctx: Context) {
    const lectures = await this.agendaService.getList(ctx.from?.id!);
    if (lectures.length === 0) {
      await ctx.reply('Удалять нечего — лекции не найдены.', this.mainMenu);
      return;
    }

    const buttons = lectures.map((l, i) => Markup.button.callback(`${i + 1}`, `DELETE_${l._id.toString()}`));
    await ctx.reply(
      'Выберите лекцию для удаления:\n' +
        lectures
          .map(
            (lecture, i) =>
              // `${i + 1}. 📅 ${lecture.data.date} ${lecture.data.timeSlot}\n🔗 ${lecture.data.link}\n👤 ${lecture.data.name}`,
              `${i + 1}.\n📅 ${lecture.data.date}\n🕒 ${lecture.data.timeSlot}\n💻 ${lecture.data.roomName}\n🔗 ${lecture.data.link}\n👤 ${lecture.data.name}`,
          )
          .join('\n\n'),
      Markup.inlineKeyboard(buttons, { columns: 5 }),
    );
  }
  // `📅 ${currentState.date}\n🕒 ${currentState.timeSlot}\n💻 ${currentState.roomName}\n🔗 ${currentState.link}\n👤 ${currentState.name}`,
  private async addLecture(userId: number, lecture: Lecture) {
    const startTimestamp = lecture.date + ' ' + lecture.timeSlot.split('-')[0];
    const endTimestamp = lecture.date + ' ' + lecture.timeSlot.split('-')[1];

    const startTimestampUtc = moment.tz(startTimestamp, 'YYYY-MM-DD HH:mm', 'Europe/Samara').toDate();
    const endTimestampUtc = moment.tz(endTimestamp, 'YYYY-MM-DD HH:mm', 'Europe/Samara').toDate();

    await this.agendaService.scheduleJob(startTimestampUtc, 'attend-lecture', {
      start: startTimestampUtc,
      end: endTimestampUtc,
      date: lecture.date,
      timeSlot: lecture.timeSlot,
      link: lecture.link,
      userId: userId,
      name: lecture.name,
      roomName: lecture.roomName,
      retriesCount: 0,
    });
  }

  @On('text')
  async onText(@Ctx() ctx: Context) {
    const userId = ctx.from?.id!;
    const currentState = this.state.get(userId);

    if (!currentState) return;

    switch (currentState.step) {
      case 'date': {
        // @ts-ignore
        const { value, error } = this.getValidDate(ctx.message.text);

        if (error) {
          await ctx.reply(error);
          return;
        }
        // @ts-ignore
        currentState.date = value;
        currentState.step = 'timeSlot';
        await ctx.reply(
          'Выберите временной слот:',
          Markup.keyboard(this.getTimeSlots(ctx.from?.id!).map((t) => [t]))
            .oneTime()
            .resize(),
        );
        return;
      }
      case 'timeSlot': {
        // @ts-ignore
        const slot = ctx.message.text;
        if (!this.getTimeSlots(ctx.from?.id!).includes(slot)) {
          await ctx.reply('Пожалуйста, выберите слот из списка.');
          return;
        }
        if (slot === 'Кастомное время') {
          currentState.step = 'customStart';
          await ctx.reply(
            'Выберите время начала:',
            Markup.keyboard(this.getCustomStartTimes(ctx.from?.id!).map((t) => [t]))
              .oneTime()
              .resize(),
          );
          return;
        } else {
          currentState.timeSlot = slot;
          currentState.step = 'link';
          await ctx.reply('Введите ссылку на лекцию:', Markup.removeKeyboard());
          return;
        }
      }
      case 'customStart': {
        // @ts-ignore
        // if (!this.getCustomStartTimes(ctx.from?.id!).includes(ctx.message.text)) {
        //   await ctx.reply('Выберите корректное время начала.');
        //   return;
        // }
        // @ts-ignore
        currentState.customStart = ctx.message.text;
        currentState.step = 'customEnd';
        await ctx.reply(
          'Теперь выберите время окончания:',
          Markup.keyboard(
            CUSTOM_TIMES.filter((t) => this.compareTimes(t, currentState.customStart) > 0).map((t) => [t]),
          )
            .oneTime()
            .resize(),
        );
        return;
      }
      case 'customEnd': {
        // if (
        //   // @ts-ignore
        //   !CUSTOM_TIMES.filter((t) => this.compareTimes(t, currentState.customStart) > 0).includes(ctx.message.text)
        // ) {
        //   await ctx.reply('Выберите корректное время окончания.');
        //   return;
        // }
        // @ts-ignore
        if (this.compareTimes(ctx.message.text, currentState.customStart) > 1) {
          await ctx.reply('Время окончания должно быть позже времени начала.');
          return;
        }
        // @ts-ignore
        currentState.timeSlot = `${currentState.customStart}-${ctx.message.text}`;
        currentState.step = 'link';
        await ctx.reply('Введите ссылку на лекцию:', Markup.removeKeyboard());
        return;
      }
      case 'link': {
        // @ts-ignore
        currentState.link = ctx.message.text;
        try {
          currentState.roomName = await this.scraperService.getRoomName(currentState.link);
        } catch (err) {
          console.error(err);
          await ctx.reply(
            `Некорректная ссылка, проверьте на опечатки, ссылка должна быть такого вида https://bbb.ssau.ru/b/some-path`,
          );
          return;
        }
        currentState.step = 'name';
        await ctx.reply('Введите имя, под которым нужно зайти:');
        return;
      }
      case 'name': {
        // @ts-ignore
        currentState.name = ctx.message.text;
        currentState.step = 'confirm';
        await ctx.reply(
          `Подтвердите создание лекции:\n\n📅 Дата: ${currentState.date}\n🕒 Время: ${currentState.timeSlot}\n💻Название комнаты: ${currentState.roomName}\n🔗 Ссылка: ${currentState.link}\n👤 Имя: ${currentState.name}`,
          Markup.inlineKeyboard([
            Markup.button.callback('✅ Подтвердить', 'confirm_add'),
            Markup.button.callback('❌ Отменить', 'cancel_add'),
          ]),
        );
        return;
      }
    }
  }

  @On('callback_query')
  async onCallback(@Ctx() ctx: Context) {
    const userId = ctx.from?.id!;
    const state = this.state.get(userId);
    // @ts-ignore
    const data = ctx.callbackQuery['data'];

    if (data === 'confirm_add' && state) {
      const lecture: Lecture = {
        date: state.date,
        timeSlot: state.timeSlot,
        link: state.link,
        name: state.name,
        roomName: state.roomName,
      };
      await this.addLecture(userId, lecture);
      this.state.delete(userId);
      await ctx.reply('✅ Лекция успешно добавлена!', this.mainMenu);
    } else if (data === 'cancel_add') {
      this.state.delete(userId);
      await ctx.reply('❌ Добавление лекции отменено.', this.mainMenu);
    } else if (data.startsWith('DELETE_')) {
      const id: string = data.replace('DELETE_', '');
      const isDeleted = await this.agendaService.deleteLecture(id);
      if (isDeleted) {
        await ctx.reply('🗑 Посещение лекции отменено', this.mainMenu);
      }
    }
  }

  private compareTimes(time1: string, time2: string): number {
    // Split into hours and minutes
    const [hours1, minutes1] = time1.split(':').map(Number);
    const [hours2, minutes2] = time2.split(':').map(Number);

    // Compare hours first
    if (hours1 < hours2) return -1;
    if (hours1 > hours2) return 1;

    // If hours are equal, compare minutes
    if (minutes1 < minutes2) return -1;
    if (minutes1 > minutes2) return 1;

    // If both hours and minutes are equal
    return 0;
  }

  private getValidDate(date: string): ValidationResult {
    let completeDate: string | undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(date)) {
      const [year, month, day] = date.split('-');
      completeDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } else if (/^\d{2}-\d{1,2}-\d{1,2}$/.test(date)) {
      const [year, month, day] = date.split('-');
      completeDate = `20${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } else if (/^\d{1,2}-\d{1,2}$/.test(date)) {
      const [month, day] = date.split('-');
      completeDate = `${today.getFullYear()}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } else if (/^\d{1,2}$/.test(date)) {
      const month = String(today.getMonth() + 1).padStart(2, '0');
      completeDate = `${today.getFullYear()}-${month}-${date.padStart(2, '0')}`;
    } else {
      return { value: null, error: 'Неверный формат даты.\nПриемлемые форматы:\n ДД\nММ-ДД\nГГ-ММ-ДД\nГГГГ-ММ-ДД' };
    }

    const { error } = Joi.date().required().min(today).validate(completeDate);

    if (error) {
      return { value: null, error: 'Дата должна быть не позже сегодня' };
    }

    return { value: completeDate, error: null };
  }

  private getCustomStartTimes(userId: number) {
    const [day, time] = getSamaraDateTimeNow();

    if (this.state.get(userId).date === day)
      return CUSTOM_TIMES.slice(0, CUSTOM_TIMES.length - 1).filter((t) => this.compareTimes(t, time) > 0);

    return CUSTOM_TIMES.slice(0, CUSTOM_TIMES.length - 1);
  }

  private compareTimeAndTimeslot(timeslot: string, time: string): number {
    const slotEnd = timeslot.split('-')[1];

    return this.compareTimes(slotEnd, time);
  }

  private getTimeSlots(userId: number) {
    const [day, time] = getSamaraDateTimeNow();

    if (this.state.get(userId).date === day)
      return TIME_SLOTS.filter((t) => {
        if (t === 'Кастомное время') {
          return true;
        }
        return this.compareTimeAndTimeslot(t, time) > 0;
      });

    return TIME_SLOTS;
  }
}
