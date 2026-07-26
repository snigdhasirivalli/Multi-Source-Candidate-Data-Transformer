import { Module } from '@nitrostack/core';
import { CalculatorTools } from './calculator.tools.js';
import { CalculatorResources } from './calculator.resources.js';

@Module({
  name: 'calculator',
  description: 'Basic arithmetic calculator',
  controllers: [CalculatorTools, CalculatorResources]
})
export class CalculatorModule {}

