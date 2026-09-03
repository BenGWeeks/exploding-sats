---
name: qr-code-generator
description: Use when implementing QR code generation - provides complete patterns for generating QR codes from text/URLs, displaying QR codes in modals, and customizing QR code appearance
when_to_use: When adding QR code generation functionality, displaying QR codes for addresses/invoices, or generating QR codes for sharing content
---

# QR Code Generation

## Overview

Complete implementation guide for QR code generation. Generate QR codes from any text or URL and display them in user-friendly modals with copy functionality.

**Core Capabilities:**
- Generate QR codes from text/URLs
- Customize QR code appearance (size, colors, error correction)
- Display QR codes in modals
- Copy content to clipboard
- Error handling and fallbacks

## Prerequisites

**IMPORTANT:** Before adding dependencies, review your project's `package.json` to check if any of these packages already exist. If they do, verify the versions are compatible with the requirements below. Only add packages that are missing or need version updates.

**Required packages:**
```json
{
  "qrcode": "^1.5.4"
}
```

## Implementation Checklist

- [ ] Install QR code package (`qrcode`)
- [ ] Implement QR code generation hook
- [ ] Add error handling and fallbacks
- [ ] Create QR code display component
- [ ] Add copy to clipboard functionality

## Part 1: QR Code Generation Hook

### Basic Generation Hook

```typescript
// hooks/useQRCodeGenerator.ts
import { useState, useCallback } from 'react';
import QRCode from 'qrcode';
// optional import { useToast } from '@/hooks/useToast';

export function useQRCodeGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Optional: User feedback notifications
  // Option 1: Console logging
  // const logMessage = (message: string) => console.log(message);
  // Option 2: Toast notifications (if useToast hook is available)
  // const { toast } = useToast();
  // Option 3: No notification handler

  const generateQRCode = useCallback(async (text: string): Promise<string> => {
    setIsGenerating(true);
    setError(null);

    try {
      const qrCodeUrl = await QRCode.toDataURL(text, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
      
      setIsGenerating(false);
      return qrCodeUrl;
    } catch (err) {
      const errorMessage = 'Failed to generate QR code';
      console.error(errorMessage, err);
      setError(errorMessage);
      setIsGenerating(false);
      
      // Optional: User feedback - choose one:
      // Option 1: Console logging
      // console.error('QR Code Failed:', errorMessage);
      // Option 2: Toast notification (if toast is available)
      // toast({ variant: "destructive", title: "QR Code Failed", description: errorMessage });
      // Option 3: No notification (silent failure)
      
      return '';
    }
  }, []);

  return {
    generateQRCode,
    isGenerating,
    error,
  };
}
```

**Usage:**
```typescript
const { generateQRCode, isGenerating } = useQRCodeGenerator();

const qrUrl = await generateQRCode('bc1p...');
// Use qrUrl as image src: <img src={qrUrl} />
```

### Generation Options

**Customize appearance:**
```typescript
await QRCode.toDataURL(text, {
  width: 512,           // Larger size for printing
  margin: 4,            // White border
  color: {
    dark: '#000000',    // QR code color
    light: '#FFFFFF',   // Background color
  },
  errorCorrectionLevel: 'M', // L, M, Q, H
});
```

**Error Correction Levels:**
- `L` - Low (~7% recovery)
- `M` - Medium (~15% recovery) - **Recommended default**
- `Q` - Quartile (~25% recovery)
- `H` - High (~30% recovery) - Use for damaged QR codes

**Color Customization:**
```typescript
// Dark mode friendly
await QRCode.toDataURL(text, {
  color: {
    dark: '#FFFFFF',    // White QR code
    light: '#000000',   // Black background
  },
});

// Brand colors
await QRCode.toDataURL(text, {
  color: {
    dark: '#1F2937',    // Dark gray
    light: '#F9FAFB',   // Light gray
  },
});
```

## Part 2: QR Code Display Component

### QR Modal Component

```typescript
// components/QRModal.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';

interface QRModalProps {
  isOpen: boolean;
  onClose: () => void;
  qrCodeUrl: string;
  content: string; // Text content shown below QR code
  title?: string;
  description?: string;
}

export function QRModal({ isOpen, onClose, qrCodeUrl, content, title, description }: QRModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          {title && <DialogTitle>{title}</DialogTitle>}
          {description && (
            <VisuallyHidden.Root asChild>
              <DialogDescription>{description}</DialogDescription>
            </VisuallyHidden.Root>
          )}
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <img src={qrCodeUrl} alt="QR Code" className="w-64 h-64" />
          <div className="flex items-center gap-2 w-full">
            <code className="flex-1 text-sm break-all p-2 bg-muted rounded">{content}</code>
            <Button onClick={handleCopy} size="icon" variant="outline" aria-label="Copy to clipboard">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Usage:**
```typescript
const [showQR, setShowQR] = useState(false);
const [qrUrl, setQrUrl] = useState('');
const { generateQRCode } = useQRCodeGenerator();

const handleShowQR = async () => {
  const url = await generateQRCode('bc1p...');
  setQrUrl(url);
  setShowQR(true);
};

<QRModal
  isOpen={showQR}
  onClose={() => setShowQR(false)}
  qrCodeUrl={qrUrl}
  content="bc1p..."
  title="Bitcoin Address"
  description="Scan this QR code to send Bitcoin"
/>
```

### Inline QR Code Display

```typescript
// components/QRCodeDisplay.tsx
import { useEffect, useState } from 'react';
import { useQRCodeGenerator } from '@/hooks/useQRCodeGenerator';
import { Skeleton } from '@/components/ui/skeleton';

interface QRCodeDisplayProps {
  content: string;
  size?: number;
  className?: string;
}

export function QRCodeDisplay({ content, size = 256, className }: QRCodeDisplayProps) {
  const { generateQRCode, isGenerating } = useQRCodeGenerator();
  const [qrUrl, setQrUrl] = useState<string>('');

  useEffect(() => {
    if (content) {
      generateQRCode(content).then(setQrUrl);
    }
  }, [content, generateQRCode]);

  if (isGenerating) {
    return <Skeleton className={className} style={{ width: size, height: size }} />;
  }

  if (!qrUrl) {
    return null;
  }

  return (
    <img
      src={qrUrl}
      alt="QR Code"
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
```

## Common Pitfalls

### 1. ❌ Not handling empty or invalid input

**Problem:** Generating QR codes from empty strings or invalid data causes errors.

**Solution:** Validate input before generation:
```typescript
const generateQRCode = useCallback(async (text: string): Promise<string> => {
  if (!text || !text.trim()) {
    setError('Cannot generate QR code from empty content');
    return '';
  }
  
  // ... rest of generation logic
}, []);
```

### 2. ❌ Not providing loading states

**Problem:** Users don't know QR code is being generated, causing confusion.

**Solution:** Always show loading state:
```typescript
{isGenerating ? (
  <Skeleton className="w-64 h-64" />
) : (
  <img src={qrUrl} alt="QR Code" />
)}
```

### 3. ❌ Not handling generation errors

**Problem:** Errors during generation cause UI to break or show nothing.

**Solution:** Always handle errors gracefully:
```typescript
try {
  const qrCodeUrl = await QRCode.toDataURL(text, options);
  return qrCodeUrl;
} catch (err) {
  console.error('Failed to generate QR code:', err);
  setError('Failed to generate QR code');
  return '';
}
```

### 4. ❌ Using wrong error correction level

**Problem:** Using too low error correction causes QR codes to be unreadable when damaged.

**Solution:** Use appropriate error correction level:
- **Default:** `M` (Medium) - Good balance
- **High damage risk:** `H` (High) - For printed materials
- **Small QR codes:** `L` (Low) - Only if space is limited

### 5. ❌ Not optimizing QR code size

**Problem:** QR codes too small are hard to scan, too large waste space.

**Solution:** Choose appropriate size:
- **Mobile display:** 256px
- **Desktop display:** 512px
- **Print:** 1024px or larger
- **Minimum scannable:** 128px

## Testing Strategy

### Unit Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useQRCodeGenerator } from '@/hooks/useQRCodeGenerator';
import QRCode from 'qrcode';

vi.mock('qrcode');

describe('useQRCodeGenerator', () => {
  it('generates QR code successfully', async () => {
    const mockDataUrl = 'data:image/png;base64,...';
    vi.mocked(QRCode.toDataURL).mockResolvedValue(mockDataUrl);

    const { result } = renderHook(() => useQRCodeGenerator());

    const qrUrl = await result.current.generateQRCode('test content');

    expect(qrUrl).toBe(mockDataUrl);
    expect(result.current.isGenerating).toBe(false);
  });

  it('handles generation errors', async () => {
    vi.mocked(QRCode.toDataURL).mockRejectedValue(new Error('Generation failed'));

    const { result } = renderHook(() => useQRCodeGenerator());

    const qrUrl = await result.current.generateQRCode('test');

    expect(qrUrl).toBe('');
    expect(result.current.error).toBeTruthy();
  });

  it('sets isGenerating state correctly', async () => {
    const mockDataUrl = 'data:image/png;base64,...';
    vi.mocked(QRCode.toDataURL).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(mockDataUrl), 100))
    );

    const { result } = renderHook(() => useQRCodeGenerator());

    const promise = result.current.generateQRCode('test');
    expect(result.current.isGenerating).toBe(true);

    await promise;
    await waitFor(() => {
      expect(result.current.isGenerating).toBe(false);
    });
  });
});
```

### Component Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QRModal } from '@/components/QRModal';

describe('QRModal', () => {
  it('displays QR code and content', () => {
    render(
      <QRModal
        isOpen={true}
        onClose={vi.fn()}
        qrCodeUrl="data:image/png;base64,..."
        content="bc1p..."
        title="Test QR"
      />
    );

    expect(screen.getByText('Test QR')).toBeInTheDocument();
    expect(screen.getByText('bc1p...')).toBeInTheDocument();
    expect(screen.getByAltText('QR Code')).toHaveAttribute('src', 'data:image/png;base64,...');
  });

  it('copies content to clipboard', async () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <QRModal
        isOpen={true}
        onClose={vi.fn()}
        qrCodeUrl="data:image/png;base64,..."
        content="bc1p..."
      />
    );

    const copyButton = screen.getByLabelText('Copy to clipboard');
    fireEvent.click(copyButton);

    expect(writeText).toHaveBeenCalledWith('bc1p...');
  });
});
```

## Security Considerations

1. **Validate input** - Don't generate QR codes from untrusted user input without validation
2. **Sanitize content** - Escape HTML/JavaScript in displayed content
3. **Rate limiting** - Prevent abuse by limiting QR code generation frequency
4. **Content size limits** - Very large QR codes can be slow to generate and scan

## Verification Checklist

- [ ] QR code generation works for all content types
- [ ] Loading states display correctly
- [ ] Error handling works gracefully
- [ ] QR codes are scannable at intended size
- [ ] Copy to clipboard functionality works
- [ ] QR codes display correctly in modals
- [ ] Works on mobile and desktop
- [ ] Error correction level appropriate for use case
- [ ] Colors provide sufficient contrast
- [ ] QR codes are accessible (alt text, ARIA labels)

## Summary

To implement QR code generation:

1. **Install package** - `qrcode`
2. **Create hook** - Use `QRCode.toDataURL()` for generation
3. **Handle errors** - Provide graceful error handling
4. **Display QR codes** - Use modal or inline display components
5. **Add copy functionality** - Allow users to copy content easily
6. **Customize appearance** - Adjust size, colors, and error correction as needed
7. **Test thoroughly** - Test generation, display, and error cases

**Key principle:** Always validate input and handle errors gracefully to ensure reliable QR code generation.

