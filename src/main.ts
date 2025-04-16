import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService: ConfigService = app.get<ConfigService>(ConfigService);
  const port = configService.get('PORT') ?? 8080;

  await app.listen(port, () => {
    console.log(`Server has been started on port: ${port}`);
  });
}
bootstrap();
