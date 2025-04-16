import { Module } from '@nestjs/common';
import { ScraperModule } from './scrapper/scraper.module';
import { ParserModule } from './parser/parser.module';
import { AnalyzerModule } from './analyzer/analyzer.module';
import { BotModule } from './bot/bot.module';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AgendaModule } from './agenda/agenda.module';
import { HealthCheckModule } from './health-check/health-check.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScraperModule,
    ParserModule,
    AnalyzerModule,
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        token: configService.getOrThrow<string>('BOT_TOKEN'),
      }),
      inject: [ConfigService],
    }),
    BotModule,
    AgendaModule,
    HealthCheckModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
