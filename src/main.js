/**
 * AI Web Content Extractor - Main Entry Point
 * 
 * This actor extracts clean, structured content from websites
 * specifically optimized for AI agents and LLMs.
 */

import { Actor } from 'apify';
import { createCrawler, runCrawler } from './crawler.js';
import { startMCPServer } from './mcp/index.js';
import { validateInput } from './utils/index.js';
import { MODES } from './constants.js';

// Initialize the Actor
await Actor.init();

try {
    // Get and validate input
    const input = await Actor.getInput() || {};
    const validatedInput = validateInput(input);
    
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║       AI WEB CONTENT EXTRACTOR FOR AI AGENTS               ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Mode: ${validatedInput.mode.padEnd(52)}║`);
    console.log(`║  URLs: ${validatedInput.urls.length.toString().padEnd(52)}║`);
    console.log(`║  Format: ${validatedInput.outputFormat.padEnd(50)}║`);
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    if (validatedInput.mode === MODES.MCP_SERVER) {
        // Start MCP Server mode
        console.log('\n🔌 Starting MCP Server...');
        await startMCPServer(validatedInput);
    } else {
        // Run content extraction
        console.log('\n🚀 Starting content extraction...');
        
        const crawler = await createCrawler(validatedInput);
        await runCrawler(crawler, validatedInput.urls);
        
        // Get extraction statistics
        const dataset = await Actor.openDataset();
        const { itemCount } = await dataset.getInfo();
        
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║                    EXTRACTION COMPLETE                      ║');
        console.log('╠════════════════════════════════════════════════════════════╣');
        console.log(`║  Pages Extracted: ${itemCount.toString().padEnd(41)}║`);
        console.log('╚════════════════════════════════════════════════════════════╝');
    }
    
} catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
} finally {
    await Actor.exit();
}