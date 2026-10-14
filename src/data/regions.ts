import type { Region } from '../types/cloud';

export const AWS_REGIONS: Region[] = [
  {
    id: 'us-east-1',
    code: 'us-east-1',
    name: 'US East (N. Virginia)',
    location: 'Estados Unidos (Este)',
    latencyMs: 38,
    deployedServices: ['EC2', 'RDS', 'S3', 'CloudFront', 'Route 53', 'IAM', 'VPC'],
    status: 'online',
    availabilityZones: 6,
    flagEmoji: '🇺🇸',
    countryCode: 'US',
    lat: 38.84,
    lng: -77.39,
    countryIds: ['USA']
  },
  {
    id: 'us-west-2',
    code: 'us-west-2',
    name: 'US West (Oregon)',
    location: 'Estados Unidos (Oeste)',
    latencyMs: 72,
    deployedServices: ['EC2', 'S3', 'RDS', 'VPC'],
    status: 'online',
    availabilityZones: 4,
    flagEmoji: '🇺🇸',
    countryCode: 'US',
    lat: 45.52,
    lng: -122.68,
    countryIds: ['USA']
  },
  {
    id: 'eu-west-1',
    code: 'eu-west-1',
    name: 'Europe (Ireland)',
    location: 'Irlanda, Europa',
    latencyMs: 115,
    deployedServices: ['EC2', 'S3', 'RDS', 'CloudFront'],
    status: 'online',
    availabilityZones: 3,
    flagEmoji: '🇮🇪',
    countryCode: 'IE',
    lat: 53.35,
    lng: -6.26,
    countryIds: ['IRL']
  },
  {
    id: 'sa-east-1',
    code: 'sa-east-1',
    name: 'South America (São Paulo)',
    location: 'São Paulo, Brasil',
    latencyMs: 46,
    deployedServices: ['EC2', 'S3', 'RDS', 'VPC'],
    status: 'warning',
    availabilityZones: 3,
    flagEmoji: '🇧🇷',
    countryCode: 'BR',
    lat: -23.55,
    lng: -46.63,
    countryIds: ['BRA']
  },
  {
    id: 'ap-southeast-1',
    code: 'ap-southeast-1',
    name: 'Asia Pacific (Singapore)',
    location: 'Singapur, Asia Pacífico',
    latencyMs: 185,
    deployedServices: ['EC2', 'S3', 'CloudFront'],
    status: 'online',
    availabilityZones: 3,
    flagEmoji: '🇸🇬',
    countryCode: 'SG',
    lat: 1.35,
    lng: 103.82,
    countryIds: ['SGP']
  }
];