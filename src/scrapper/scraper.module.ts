import { Module } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { ScraperController } from './scraper.controller';
import { AnalyzerModule } from '../analyzer/analyzer.module';
import { ParserModule } from '../parser/parser.module';

@Module({
  providers: [ScraperService],
  controllers: [ScraperController],
  imports: [AnalyzerModule, ParserModule],
  exports: [ScraperService],
})
export class ScraperModule {}
