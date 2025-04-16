import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { AgendaModule } from '../agenda/agenda.module';
import { ScraperModule } from '../scrapper/scraper.module';

@Module({
  providers: [BotService],
  imports: [AgendaModule, ScraperModule],
})
export class BotModule {}
