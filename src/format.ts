export function greeting(date = new Date()): string {
  const hour = date.getHours();

  if (hour < 12) {
    return 'Good morning';
  }

  if (hour < 17) {
    return 'Good afternoon';
  }

  return 'Good evening';
}

export function clock(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }

  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function elapsed(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) {
    return '00:00:00';
  }

  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));

  return formatSeconds(seconds);
}

export function formatSeconds(total: number): string {
  const seconds = Math.max(0, total);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const remain = seconds % 60;

  return [hours, minutes, remain].map((part) => String(part).padStart(2, '0')).join(':');
}

export function hoursLabel(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

export function plain(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function ago(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }

  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);

  if (minutes < 1) {
    return 'now';
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.round(hours / 24)}d`;
}

export function ymd(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

export function prettyDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);

  if (!year || !month || !day) {
    return iso;
  }

  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

type Place = {
  address?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
};

export function mapsUrl(place: Place | null | undefined): string | null {
  if (!place) {
    return null;
  }

  if (place.latitude && place.longitude) {
    return `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`;
  }

  if (place.address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.address)}`;
  }

  return null;
}
