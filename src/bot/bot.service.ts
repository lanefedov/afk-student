import { Injectable } from '@nestjs/common';
import { Ctx, Start, Update, Command, On, InjectBot } from 'nestjs-telegraf';
import { Context, Markup, Telegraf } from 'telegraf';
import { AgendaService } from '../agenda/agenda.service';
import * as moment from 'moment-timezone';
import * as Joi from 'joi';
import { ScraperService } from '../scrapper/scraper.service';

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
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
];

@Injectable()
@Update()
export class BotService {
  private userLectures = new Map<number, Lecture[]>();
  private state = new Map<number, any>();
  private mainMenu = Markup.keyboard([['/add'], ['/list'], ['/delete']])
    .oneTime()
    .resize();

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
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
    await ctx.reply('Введите дату лекции в формате ГГГГ-ММ-ДД');
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
        `${i + 1}. 📅 ${lecture.data.date} ${lecture.data.timeSlot}\n🔗 ${lecture.data.link}\n👤 ${lecture.data.name}`,
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
              `${i + 1}. 📅 ${lecture.data.date} ${lecture.data.timeSlot}\n🔗 ${lecture.data.link}\n👤 ${lecture.data.name}`,
          )
          .join('\n\n'),
      Markup.inlineKeyboard(buttons, { columns: 5 }),
    );
  }

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
    });
  }

  @On('text')
  async onText(@Ctx() ctx: Context) {
    const userId = ctx.from?.id!;
    const currentState = this.state.get(userId);

    if (!currentState) return;

    switch (currentState.step) {
      case 'date': {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        // @ts-ignore
        if (!dateRegex.test(ctx.message.text)) {
          await ctx.reply('Неверный формат даты. Пожалуйста, введите в формате ГГГГ-ММ-ДД');
          return;
        }
        // @ts-ignore
        const { error } = Joi.date().required().validate(ctx.message.text);
        if (error) {
          await ctx.reply('Некорректная дата.');
          return;
        }
        // @ts-ignore
        currentState.date = ctx.message.text;
        currentState.step = 'timeSlot';
        await ctx.reply(
          'Выберите временной слот:',
          Markup.keyboard(TIME_SLOTS.map((t) => [t]))
            .oneTime()
            .resize(),
        );
        return;
      }
      case 'timeSlot': {
        // @ts-ignore
        const slot = ctx.message.text;
        if (!TIME_SLOTS.includes(slot)) {
          await ctx.reply('Пожалуйста, выберите слот из списка.');
          return;
        }
        if (slot === 'Кастомное время') {
          currentState.step = 'customStart';
          await ctx.reply(
            'Выберите время начала:',
            Markup.keyboard(CUSTOM_TIMES.map((t) => [t]))
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
        if (!CUSTOM_TIMES.includes(ctx.message.text)) {
          await ctx.reply('Выберите корректное время начала.');
          return;
        }
        // @ts-ignore
        currentState.customStart = ctx.message.text;
        currentState.step = 'customEnd';
        await ctx.reply(
          'Теперь выберите время окончания:',
          Markup.keyboard(CUSTOM_TIMES.map((t) => [t]))
            .oneTime()
            .resize(),
        );
        return;
      }
      case 'customEnd': {
        // @ts-ignore
        if (!CUSTOM_TIMES.includes(ctx.message.text)) {
          await ctx.reply('Выберите корректное время окончания.');
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
            'Некорректная ссылка, проверьте на опечатки, ссылка должна быть такого вида https://bbb.ssau.ru/b/erw-iht-weq',
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
          `Подтвердите создание лекции:\n\n📅 Дата: ${currentState.date}\n🕒 Время: ${currentState.timeSlot}\n🔗 Ссылка: ${currentState.link}\n👤 Имя: ${currentState.name}`,
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
}
