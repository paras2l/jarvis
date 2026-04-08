"""Curiosity Engine package for Jarvis autonomous research."""

from jarvis.curiosity_engine.curiosity_core import CuriosityCore, CuriosityCycleResult, CuriosityPolicy
from jarvis.curiosity_engine.knowledge_gap_detector import KnowledgeGap, KnowledgeGapDetector, KnowledgeGapReport
from jarvis.curiosity_engine.question_generator import QuestionGenerationReport, QuestionGenerator, ResearchQuestion
from jarvis.curiosity_engine.research_agent import ResearchAgent, ResearchBatch, ResearchHit, SourceVerifier
from jarvis.curiosity_engine.knowledge_summarizer import KnowledgeSummarizer, SummaryBatch, SummaryRecord
from jarvis.curiosity_engine.learning_memory_updater import LearningMemoryUpdater, UpdateBatch, UpdateRecord

__all__ = [
    "CuriosityCore",
    "CuriosityCycleResult",
    "CuriosityPolicy",
    "KnowledgeGap",
    "KnowledgeGapDetector",
    "KnowledgeGapReport",
    "QuestionGenerator",
    "QuestionGenerationReport",
    "ResearchQuestion",
    "ResearchAgent",
    "ResearchBatch",
    "ResearchHit",
    "SourceVerifier",
    "KnowledgeSummarizer",
    "SummaryBatch",
    "SummaryRecord",
    "LearningMemoryUpdater",
    "UpdateBatch",
    "UpdateRecord",
]
