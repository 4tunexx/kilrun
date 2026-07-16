import { HelpCircle, Mail, Phone } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const faqs = [
  {
    question: 'How do I reset my password?',
    answer:
      "You can reset your password from the login screen by clicking 'Forgot Password'. You will receive an email with instructions.",
  },
  {
    question: 'How do I change my username?',
    answer:
      'Usernames cannot be changed at this time. We are working on adding this feature in a future update.',
  },
  {
    question: 'How does the ranking system work?',
    answer:
      'The ranking system is based on your performance in competitive matches. Winning matches against higher-ranked opponents will increase your rank faster.',
  },
  {
    question: 'I found a bug. Where can I report it?',
    answer:
      'You can report bugs through our official Discord server or by using the contact form on this page. Please provide as much detail as possible.',
  },
];

export default function SupportView() {
  return (
    <div className="px-12 py-8">
      <h1 className="text-5xl font-black mb-8 flex items-center gap-4">
        <HelpCircle className="w-12 h-12 text-blue-400" />
        Support Center
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle>Frequently Asked Questions</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, index) => (
                  <AccordionItem
                    value={`item-${index}`}
                    key={index}
                    className="border-slate-700/50"
                  >
                    <AccordionTrigger className="hover:no-underline text-left">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-slate-300">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle>Contact Us</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Your Email"
                className="bg-slate-900/50 border-slate-700 focus:ring-primary/50"
              />
              <Input
                placeholder="Subject"
                className="bg-slate-900/50 border-slate-700 focus:ring-primary/50"
              />
              <Textarea
                placeholder="Describe your issue..."
                className="bg-slate-900/50 border-slate-700 focus:ring-primary/50 h-32"
              />
              <Button className="w-full">Send Message</Button>
              <div className="flex items-center justify-center space-x-6 pt-4 text-slate-400">
                <div className="flex items-center gap-2 hover:text-primary transition cursor-pointer">
                  <Mail size={16} />
                  <span>support@kilrun.com</span>
                </div>
                <div className="flex items-center gap-2 hover:text-primary transition cursor-pointer">
                  <Phone size={16} />
                  <span>+1 (234) 567-890</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}