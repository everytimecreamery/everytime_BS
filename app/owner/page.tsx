'use client';

import React, { useState } from 'react';
import { OwnerSidebar } from '@/components/owner/OwnerSidebar';
import { OwnerHeader } from '@/components/owner/OwnerHeader';
import { OwnerSectionView } from '@/components/owner/OwnerSectionView';
import { OWNER_NAV_ITEMS } from '@/lib/constants';

export default function OwnerPage() {
  const [currentSection, setCurrentSection] = useState<string>('dashboard');

  const activeItem =
    OWNER_NAV_ITEMS.find((item) => item.id === currentSection) || OWNER_NAV_ITEMS[0];

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Sidebar Navigation */}
      <OwnerSidebar
        currentSection={currentSection}
        onSelectSection={(sectionId) => setCurrentSection(sectionId)}
      />

      {/* Main Back Office Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <OwnerHeader
          title={activeItem.label}
          description={activeItem.description}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <OwnerSectionView sectionId={currentSection} />
        </main>
      </div>
    </div>
  );
}

