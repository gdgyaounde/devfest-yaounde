"use client";

import { createContext, useContext } from "react";
import { EVENT_DATES } from "@/lib/calendar";

const EventDatesContext = createContext<readonly string[]>(EVENT_DATES);

export function EventDateProvider({
  date,
  children,
}: {
  date: string;
  children: React.ReactNode;
}) {
  return (
    <EventDatesContext.Provider value={[date]}>
      {children}
    </EventDatesContext.Provider>
  );
}

export function useEventDates() {
  return useContext(EventDatesContext);
}
