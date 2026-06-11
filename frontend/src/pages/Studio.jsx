import React from 'react';
import { StudioProvider } from '../studio/context/StudioContext';
import StudioContent from './StudioContent';

export default function StudioPage() {
  return (
    <StudioProvider>
      <StudioContent />
    </StudioProvider>
  );
}
