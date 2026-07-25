import { Module } from '@nitrostack/core';
import { RecruiterTools } from './recruiter.tools.js';
import { RecruiterResources } from './recruiter.resources.js';
import { RecruiterPrompts } from './recruiter.prompts.js';

@Module({
  name: 'recruiter',
  description: 'Autonomous Recruiting Helper module for candidate evaluation',
  controllers: [RecruiterTools, RecruiterResources, RecruiterPrompts]
})
export class RecruiterModule {}
