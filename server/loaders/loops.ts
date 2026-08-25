import searchLoop from '../jobs/searchLoop';
import tradeAlertLoop from '../jobs/tradeAlertLoop';
import clearQueue from '../jobs/clearQueue';

/**
 * Starts the clearing queue loop
 */
clearQueue();

/**
 * Starts the nation searching loop
 */
searchLoop();

/**
 * Starts the trade-create subscription loop (underpriced sell offer alerts)
 */
tradeAlertLoop();
