/**
 * Layer 8: Reflective Learning Layer
 * Type definitions for self-improvement, outcome evaluation, and policy refinement
 */

/**
 * Represents an individual action outcome captured in the system
 */
export interface ActionOutcome {
  actionId: string;
  actionType: 'reactive' | 'proactive' | 'exploratory';
  timestamp: number;
  executedAt: number;
  completedAt?: number;
  success: boolean;
  duration?: number; // milliseconds
  outcomeSummary: string;
  contextSnapshot: Record<string, unknown>;
}

/**
 * Evaluation result comparing predicted vs actual outcomes
 */
export interface OutcomeEvaluation {
  evaluationId: string;
  actionId: string;
  predictedOutcome: string;
  actualOutcome: string;
  predictionAccuracy: number; // 0-1 confidence in prediction
  deviationScore: number; // 0-1, how much actual deviated from predicted
  timelineDeviation: number; // milliseconds difference
  successRate: number; // 0-1 across similar actions
  efficiency: number; // 0-1 based on resource usage
  timestamp: number;
  notes: string;
}

/**
 * Feedback signal from users or environment
 */
export interface FeedbackSignal {
  feedbackId: string;
  actionId: string;
  source: 'user_explicit' | 'user_implicit' | 'environment' | 'system_monitor';
  feedbackType: 'approval' | 'rejection' | 'correction' | 'optimization' | 'safety_flag';
  intensity: number; // 0-1, strength of feedback signal
  rationale?: string;
  timestamp: number;
}

/**
 * Suggested policy update based on learning analysis
 */
export interface PolicyUpdate {
  updateId: string;
  policyName: string;
  updateType: 'threshold_adjustment' | 'pattern_promotion' | 'pattern_suppression' | 'strategy_refinement';
  currentValue: number | string;
  suggestedValue: number | string;
  confidence: number; // 0-1, confidence in this update
  supportingEvidence: string[];
  affectedMetrics: string[];
  estimatedImpact: {
    successRateChange: number; // expected change
    efficiencyChange: number;
    riskChange: number;
  };
  timestamp: number;
  status: 'pending' | 'approved' | 'deployed' | 'rolled_back';
}

/**
 * Confidence score adjustment for a specific module or action
 */
export interface ConfidenceCalibration {
  calibrationId: string;
  moduleId: string;
  actionType?: 'reactive' | 'proactive' | 'exploratory';
  historicalAccuracy: number; // 0-1
  previousConfidenceLevel: number; // 0-1
  adjustedConfidenceLevel: number; // 0-1
  calibrationReason: string;
  sampleSize: number; // how many outcomes used for calibration
  timestamp: number;
}

/**
 * Aggregated learning metrics across all systems
 */
export interface LearningMetrics {
  metricsId: string;
  period: {
    startTime: number;
    endTime: number;
    sampleCount: number;
  };
  
  outcomeMetrics: {
    totalActionsEvaluated: number;
    successfulActions: number;
    successRate: number; // 0-1
    averageEfficiency: number; // 0-1
    predictivePrecision: number; // how accurate predictions are
    deviationTolerance: number; // acceptable deviation range
  };

  feedbackMetrics: {
    totalFeedbackSignals: number;
    userExplicitFeedback: number;
    userImplicitFeedback: number;
    environmentalSignals: number;
    averageFeedbackIntensity: number;
  };

  learningMetrics: {
    policiesRefined: number;
    policiesDeployed: number;
    policiesRolledBack: number;
    confidenceAdjustments: number;
    averageConfidenceShift: number;
  };

  performanceMetrics: {
    overallSystemAccuracy: number;
    taskCompletionRate: number;
    averageTaskDuration: number;
    errorRate: number;
  };
}

/**
 * Auditable record of learning system activity
 */
export interface LearningLogEntry {
  entryId: string;
  timestamp: number;
  type: 'outcome_evaluation' | 'feedback_integration' | 'policy_update' | 'confidence_adjustment' | 'metric_calculation';
  subject: string; // what was changed
  description: string;
  dataSnapshot: Record<string, unknown>;
  source: string; // which component generated this
  isRollbackable: boolean;
  rolledBackAt?: number;
}

/**
 * Container for confidence score updates to be applied
 */
export interface ConfidenceUpdate {
  moduleId: string;
  actionType?: 'reactive' | 'proactive' | 'exploratory';
  newConfidence: number; // 0-1
  reason: string;
  effectiveAt: number;
}

/**
 * Pattern detected in success/failure analysis
 */
export interface DetectedPattern {
  patternId: string;
  type: 'success_pattern' | 'failure_pattern' | 'inefficiency_pattern' | 'risk_pattern';
  description: string;
  frequency: number; // times observed
  affectedActions: string[];
  recommendation: string;
  confidence: number; // 0-1
  timestamp: number;
}

/**
 * Learning system state interface
 */
export interface ReflectiveLearningState {
  isInitialized: boolean;
  lastEvaluationTime: number;
  totalOutcomesEvaluated: number;
  activeMetrics: LearningMetrics;
  pendingPolicyUpdates: PolicyUpdate[];
  deployedPolicies: PolicyUpdate[];
  calibrationHistory: ConfidenceCalibration[];
  detectedPatterns: DetectedPattern[];
}
