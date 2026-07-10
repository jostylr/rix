import { parse, tokenize } from '../../index.js';

// DOM Elements
const inputExpression = document.getElementById('input-expression');
const parseButton = document.getElementById('parse-button');
const astTree = document.getElementById('ast-tree');
const tokensList = document.getElementById('tokens-list');
const rawOutput = document.getElementById('raw-output');
const diagnosticsContent = document.getElementById('diagnostics-content');
const nodeModal = document.getElementById('node-modal');
const modalTitle = document.getElementById('modal-title');
const modalContent = document.getElementById('modal-content');
const modalCloseButton = document.getElementById('modal-close');
const closeButton = document.querySelector('.close-button');
const examplesDropdown = document.getElementById('examples-dropdown');
const copyButton = document.getElementById('copy-button');
const clearButton = document.getElementById('clear-button');

// Tab functionality
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const targetTab = button.getAttribute('data-tab');

        // Update active states
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanels.forEach(panel => panel.classList.remove('active'));

        button.classList.add('active');
        document.getElementById(`${targetTab}-tab`).classList.add('active');
    });
});

// Parse button functionality
parseButton.addEventListener('click', parseExpression);
inputExpression.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        parseExpression();
    } else if (e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        parseExpression();
    }
});

function parseExpression() {
    const expression = inputExpression.value.trim();
    if (!expression) {
        showPlaceholder();
        return;
    }

    try {
        // Tokenize first
        const tokens = tokenize(expression);
        displayTokens(tokens);

        // Parse to AST
        const ast = parse(expression);
        displayAST(ast);
        displayRaw(ast);

        // Clear diagnostics if successful
        displayDiagnostics([]);
    } catch (error) {
        // Display error
        displayError(error);
    }
}

function displayTokens(tokens) {
    tokensList.innerHTML = '';

    tokens.forEach(token => {
        const tokenElement = document.createElement('div');
        tokenElement.className = 'token-item';
        tokenElement.innerHTML = `
            <span class="token-type">${token.type}</span>
            <span class="token-value">${escapeHtml(token.value)}</span>
        `;
        tokensList.appendChild(tokenElement);
    });
}

function displayAST(ast) {
    astTree.innerHTML = '';
    const rootNode = createTreeNode(ast, 'Program');
    astTree.appendChild(rootNode);
}

function createTreeNode(node, nodeName = null, isRoot = false) {
    const treeNode = document.createElement('div');
    treeNode.className = 'tree-node';
    
    const header = document.createElement('div');
    header.className = 'node-header';
    
    // Create compact display
    const compactContent = createCompactNodeDisplay(node, nodeName);
    header.appendChild(compactContent.main);
    
    // Add metadata toggle if there are metadata properties
    if (compactContent.hasMetadata) {
        const metaToggle = document.createElement('span');
        metaToggle.className = 'meta-toggle';
        metaToggle.textContent = '▼';
        metaToggle.title = 'Show/hide original and position data';
        header.appendChild(metaToggle);
        
        const metaContainer = document.createElement('div');
        metaContainer.className = 'metadata-container';
        metaContainer.style.display = 'none';
        
        if (node && typeof node === 'object' && node.original) {
            const originalDiv = document.createElement('div');
            originalDiv.className = 'metadata-item';
            originalDiv.innerHTML = `<strong>original:</strong> "${escapeHtml(node.original)}"`;
            metaContainer.appendChild(originalDiv);
        }
        
        if (node && typeof node === 'object' && node.pos) {
            const posDiv = document.createElement('div');
            posDiv.className = 'metadata-item';
            posDiv.innerHTML = `<strong>pos:</strong> [${node.pos.join(', ')}]`;
            metaContainer.appendChild(posDiv);
        }
        
        treeNode.appendChild(metaContainer);
        
        metaToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = metaContainer.style.display === 'none';
            metaContainer.style.display = isHidden ? 'block' : 'none';
            metaToggle.textContent = isHidden ? '▲' : '▼';
        });
    }
    
    treeNode.appendChild(header);
    
    // Add children if any
    if (compactContent.children && compactContent.children.length > 0) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'node-children expanded'; // Default to expanded
        
        compactContent.children.forEach(({key, value}) => {
            const childWrapper = document.createElement('div');
            childWrapper.className = 'child-wrapper';
            
            // Add key label
            const keyLabel = document.createElement('span');
            keyLabel.className = 'key-label';
            keyLabel.textContent = `${key.toUpperCase()}:`;
            childWrapper.appendChild(keyLabel);
            
            // Add the actual tree node
            const childNode = createTreeNode(value, key, false);
            childNode.style.display = 'inline-block';
            childWrapper.appendChild(childNode);
            
            childrenContainer.appendChild(childWrapper);
        });
        
        treeNode.appendChild(childrenContainer);
    }
    
    return treeNode;
}

function createCompactNodeDisplay(node, nodeName) {
    const mainDiv = document.createElement('div');
    mainDiv.className = 'compact-node';
    
    let children = [];
    let hasMetadata = false;
    
    if (!node || typeof node !== 'object') {
        // Primitive value
        const typeSpan = document.createElement('span');
        typeSpan.className = 'node-type';
        typeSpan.textContent = nodeName || typeof node;
        mainDiv.appendChild(typeSpan);
        
        const colonSpan = document.createElement('span');
        colonSpan.textContent = ': ';
        mainDiv.appendChild(colonSpan);
        
        const valueSpan = document.createElement('span');
        valueSpan.className = 'node-value';
        valueSpan.textContent = String(node);
        mainDiv.appendChild(valueSpan);
        
        return { main: mainDiv, children, hasMetadata };
    }
    
    if (Array.isArray(node)) {
        // Array
        const typeSpan = document.createElement('span');
        typeSpan.className = 'node-type';
        typeSpan.textContent = nodeName || 'Array';
        mainDiv.appendChild(typeSpan);
        
        const colonSpan = document.createElement('span');
        colonSpan.textContent = ': ';
        mainDiv.appendChild(colonSpan);
        
        const valueSpan = document.createElement('span');
        valueSpan.className = 'node-value';
        valueSpan.textContent = `[${node.length} items]`;
        mainDiv.appendChild(valueSpan);
        
        children = node.map((item, index) => ({key: `[${index}]`, value: item}));
        
        return { main: mainDiv, children, hasMetadata };
    }
    
    // AST Node
    const nodeType = node.type || nodeName || 'Node';
    
    const typeSpan = document.createElement('span');
    typeSpan.className = 'node-type';
    typeSpan.textContent = nodeType;
    mainDiv.appendChild(typeSpan);
    
    const colonSpan = document.createElement('span');
    colonSpan.textContent = ': ';
    mainDiv.appendChild(colonSpan);
    
    // Get identifying value for this node type
    const identifyingInfo = getNodeIdentifyingInfo(node);
    if (identifyingInfo.value) {
        const valueSpan = document.createElement('span');
        valueSpan.className = 'node-value';
        valueSpan.textContent = identifyingInfo.value;
        mainDiv.appendChild(valueSpan);
        
        // Add the property key in parentheses if available
        if (identifyingInfo.key) {
            const keySpan = document.createElement('span');
            keySpan.className = 'node-key';
            keySpan.textContent = ` (${identifyingInfo.key})`;
            mainDiv.appendChild(keySpan);
        }
    }
    
    // Check for metadata (original, pos)
    hasMetadata = !!(node.original || node.pos);
    
    // Get relevant child properties (excluding original, pos, type, and the identifying property)
    const relevantProps = Object.keys(node).filter(key => 
        key !== 'type' && 
        key !== 'original' && 
        key !== 'pos' && 
        key !== identifyingInfo.key && // Exclude the identifying property
        node[key] !== null && 
        node[key] !== undefined
    );
    
    children = relevantProps.map(key => ({key, value: node[key]}));
    
    return { main: mainDiv, children, hasMetadata };
}

function getNodeIdentifyingInfo(node) {
    // Return an identifying value and property key for common node types
    switch (node.type) {
        case 'Number':
            return { value: node.value, key: 'value' };
        case 'String':
            return { value: `"${node.value}"`, key: 'value' };
        case 'UserIdentifier':
        case 'SystemIdentifier':
            return { value: node.name, key: 'name' };
        case 'BinaryOperation':
        case 'UnaryOperation':
            return { value: node.operator, key: 'operator' };
        case 'PlaceHolder':
            return { value: `_${node.place}`, key: 'place' };
        case 'Array':
            return { value: node.elements ? `[${node.elements.length} items]` : '[]', key: null };
        case 'Matrix':
            return { value: node.rows ? `${node.rows.length}×${node.rows[0]?.length || 0} matrix` : 'matrix', key: null };
        case 'FunctionCall':
            return { value: `${node.function?.name || 'function'}()`, key: null };
        case 'FunctionDefinition':
            return { value: `${node.name?.name || 'function'} := ...`, key: null };
        case 'Derivative':
            return { value: `${"'".repeat(node.order || 1)}`, key: 'order' };
        case 'Integral':
            return { value: `${"'".repeat(node.order || 1)}`, key: 'order' };
        case 'ScientificUnit':
            return { value: `~[${node.unit}]`, key: 'unit' };
        case 'MathematicalUnit':
            return { value: `~{${node.unit}}`, key: 'unit' };
        case 'TernaryOperation':
            return { value: '?? ?: ', key: null };
        case 'GeneratorChain':
            return { value: `${node.operators?.length || 0} generators`, key: null };
        default:
            if (node.value !== undefined) return { value: String(node.value), key: 'value' };
            if (node.name !== undefined) return { value: String(node.name), key: 'name' };
            if (node.operator !== undefined) return { value: String(node.operator), key: 'operator' };
            return { value: '', key: null };
    }
}

function getNodePreview(node) {
    if (Array.isArray(node)) {
        return `[${node.length} items]`;
    }

    const keys = Object.keys(node).filter(k => k !== 'type' && node[k] !== null);
    if (keys.length === 0) return '';

    const preview = keys.slice(0, 3).map(k => {
        const value = node[k];
        if (value === null || value === undefined) return null;
        if (typeof value === 'object') {
            return `${k}: {...}`;
        }
        return `${k}: ${String(value).slice(0, 20)}`;
    }).filter(Boolean).join(', ');

    return `{${preview}${keys.length > 3 ? ', ...' : ''}}`;
}

function displayRaw(ast) {
    rawOutput.textContent = JSON.stringify(ast, null, 2);
}

function displayDiagnostics(diagnostics) {
    if (!diagnostics || diagnostics.length === 0) {
        diagnosticsContent.innerHTML = '<p class="placeholder">No errors or warnings</p>';
        return;
    }

    diagnosticsContent.innerHTML = '';
    diagnostics.forEach(diagnostic => {
        const item = document.createElement('div');
        item.className = `diagnostic-item ${diagnostic.severity}`;
        item.innerHTML = `
            <div>${escapeHtml(diagnostic.message)}</div>
            ${diagnostic.location ? `<div class="diagnostic-location">Line ${diagnostic.location.line}, Column ${diagnostic.location.column}</div>` : ''}
        `;
        diagnosticsContent.appendChild(item);
    });
}

function displayError(error) {
    // Display in all tabs
    astTree.innerHTML = `<div class="diagnostic-item error">${escapeHtml(error.message)}</div>`;
    tokensList.innerHTML = `<div class="diagnostic-item error">${escapeHtml(error.message)}</div>`;
    rawOutput.textContent = error.stack || error.message;

    // Display in diagnostics
    displayDiagnostics([{
        severity: 'error',
        message: error.message,
        location: error.location
    }]);
}

function showPlaceholder() {
    astTree.innerHTML = '<p class="placeholder">Parse an expression to see the AST</p>';
    tokensList.innerHTML = '<p class="placeholder">Parse an expression to see tokens</p>';
    rawOutput.textContent = 'Parse an expression to see raw output';
    diagnosticsContent.innerHTML = '<p class="placeholder">No errors or warnings</p>';
}

// Examples dropdown functionality
examplesDropdown.addEventListener('change', (e) => {
    if (e.target.value) {
        // Always replace the current content
        inputExpression.value = e.target.value;
        // Reset dropdown to placeholder
        e.target.selectedIndex = 0;
        // Auto-parse the new content
        parseExpression();
    }
});

// Copy button functionality
copyButton.addEventListener('click', async () => {
    const text = inputExpression.value;
    if (text.trim()) {
        try {
            await navigator.clipboard.writeText(text);
            // Visual feedback
            const originalText = copyButton.textContent;
            copyButton.textContent = '✓';
            setTimeout(() => {
                copyButton.textContent = originalText;
            }, 1000);
        } catch (err) {
            // Fallback for older browsers
            inputExpression.select();
            document.execCommand('copy');
            const originalText = copyButton.textContent;
            copyButton.textContent = '✓';
            setTimeout(() => {
                copyButton.textContent = originalText;
            }, 1000);
        }
    }
});

// Clear button functionality
clearButton.addEventListener('click', () => {
    inputExpression.value = '';
    showPlaceholder();
    inputExpression.focus();
});

// Modal functionality
function showNodeModal(node, title) {
    modalTitle.textContent = title;
    modalContent.textContent = JSON.stringify(node, null, 2);
    nodeModal.classList.add('show');
}

function closeModal() {
    nodeModal.classList.remove('show');
}

modalCloseButton.addEventListener('click', closeModal);
closeButton.addEventListener('click', closeModal);
nodeModal.addEventListener('click', (e) => {
    if (e.target === nodeModal) {
        closeModal();
    }
});

// Utility function
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Parse initial expression if provided and ensure AST tab is active
if (inputExpression.value.trim()) {
    parseExpression();
}

// Ensure AST tab is active by default
document.addEventListener('DOMContentLoaded', () => {
    // Set AST tab as active
    tabButtons.forEach((btn) => btn.classList.remove('active'));
    tabPanels.forEach((panel) => panel.classList.remove('active'));
    
    const astButton = document.querySelector('[data-tab="ast"]');
    const astPanel = document.getElementById('ast-tab');
    
    if (astButton && astPanel) {
        astButton.classList.add('active');
        astPanel.classList.add('active');
    }
});
