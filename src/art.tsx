import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/theme';

export function WeekRing({ minutes, goal = 37.5 * 60 }: { minutes: number; goal?: number }) {
  const size = 76;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, minutes / goal));

  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.greenSoft} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={colors.greenDark}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${circumference * progress} ${circumference}`}
        strokeLinecap="round"
        rotation={-90}
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

export function EmptyDay() {
  return (
    <Svg width={140} height={84} viewBox="0 0 140 84">
      <Path d="M8 62c22-18 40-18 62 0s40 18 62 0" stroke={colors.line} strokeWidth={6} fill="none" strokeLinecap="round" />
      <Circle cx={46} cy={40} r={16} fill={colors.greenSoft} />
      <Path d="M46 28c6 0 10 5 10 11 0 8-10 16-10 16s-10-8-10-16c0-6 4-11 10-11z" fill={colors.greenDark} />
      <Circle cx={46} cy={38} r={3.5} fill={colors.card} />
      <Path d="M92 22h28a8 8 0 0 1 8 8v18a8 8 0 0 1-8 8H92a8 8 0 0 1-8-8V30a8 8 0 0 1 8-8z" fill={colors.side} />
      <Path d="M96 34h20M96 42h14" stroke={colors.green} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}
