import express, { Request, Response, NextFunction } from 'express';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import 'reflect-metadata';
import { CheckContextAggregator } from '../aggregator/ContextAggregator';
import {
  generateContextAnalysis,
  generateContextAnalysisSummary,
} from '../aggregator/chains';
import { WebhookAlertDto } from '../checkly/alertDTO';
import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';

const router = express.Router();

router.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Hello from Express!' });
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const alertDto = plainToInstance(WebhookAlertDto, body, {
      enableImplicitConversion: true,
    });

    // Validate the DTO
    await validateOrReject(alertDto);

    const aggregator = new CheckContextAggregator(alertDto);
    const context = await aggregator.aggregate();
    const contextAnalysis = await generateContextAnalysis(context);
    const summary = await generateContextAnalysisSummary(contextAnalysis);

    await prisma.alert
      .create({
        data: {
          data: { ...alertDto } as unknown as Prisma.InputJsonValue,
          context: JSON.stringify(contextAnalysis),
          summary,
        },
      })
      .catch((error) => {
        console.error('Error saving alert to the database:', error);
        return res.status(500).json({ message: 'Error saving alert to the database' });
      });

    res.json({ message: 'OK' });
  } catch (error) {
    console.error('Error parsing or validating request body:', error);
    res.status(400).json({ message: 'Invalid request body' });
  }
});

export default router;