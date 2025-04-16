import { Module } from '@nestjs/common';
import { AgendaService } from './agenda.service';
import { ScraperModule } from '../scrapper/scraper.module';

@Module({
  providers: [AgendaService],
  exports: [AgendaService],
  imports: [ScraperModule],
})
export class AgendaModule {}
