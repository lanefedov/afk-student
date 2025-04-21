import { Module } from '@nestjs/common';
import { AgendaService } from './agenda.service';
import { ScraperModule } from '../scrapper/scraper.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  providers: [AgendaService],
  exports: [AgendaService],
  imports: [ScraperModule, NotificationModule],
})
export class AgendaModule {}
